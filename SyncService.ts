

import { ipcSend } from "./main";
import { App, fs, path, mkdirp } from "./app";
import { TraderAccount } from "./TraderAccount";
import { Order } from "./Order";
import { SyncTraderException } from "./SyncTraderException";
import { SyncUtil } from "./SyncUtil";
import { AccountOrderPlacement, PairAccount, PairOrder, PairTicket, StringBoolNull } from "./Types"
import { MessageBuffer } from "./MessageBuffer";
import { Config } from "./Config";
import { Constants } from "./Constants";
import { OrderPlacement } from "./OrderPlacement";
import { Emailer } from "./Emailer";
import { PlaceOrderTrigger } from "./PlaceOrderTrigger";

export class SyncService {

    private pairedAccounts: Array<PairAccount> = new Array();
    private unpairedAccounts: Array<TraderAccount> = new Array();
    private readonly PING_INTERVAL: number = 1000;
    private RoutineSyncChecksIntervalID;
    private RoutineRefreshAccountInfoIntervalID;

    private LastRoutineSyncChecksInterval: number = 0;
    private LastRoutineRefreshAccountInfoInterval: number = 0;
    private PlaceOrdersTriggerList: Array<PlaceOrderTrigger> = new Array<PlaceOrderTrigger>();

    //ROUTINE SYNC CHECKS INTERVAL
    private RoutineSyncChecksInterval: Function = function (): number {
        var default_val = 10;
        var val = SyncUtil.AppConfigMap.get('sync_check_interval_in_seconds') - 0 || default_val;
        return (val <= 0 ? default_val : val) * 1000;
    };

    private RoutineRefreshAccountInfoInterval: Function = function (): number {
        var default_val = 10;
        var val = SyncUtil.AppConfigMap.get('refresh_account_info_interval_in_seconds') - 0 || default_val;
        return (val <= 0 ? default_val : val) * 1000;
    };


    //collection of all successfully synchronized trades - this will be loaded from the
    //database. after every successful synchronizatio this collection must be updated
    //and saved to the database. This is the collections that will be used to check if
    //the paired trades are actually synchronized.
    //the Keys of the dictinary is the PairIDs while the Values are the paired order tickets
    //of the respective trades successfully synchronized (copied)

    syncOpenTickectPairs: Map<string, PairTicket[]> = new Map<string, PairTicket[]>();
    syncClosedTickectPairs: Map<string, PairTicket[]> = new Map<string, PairTicket[]>();
    pendingAccountPlacementOrderMap: Map<string, AccountOrderPlacement[]> = new Map<string, AccountOrderPlacement[]>();

    private emailer: Emailer = new Emailer();

    public Start() {

        try {

            SyncUtil.LoadAappConfig();

            //first load the sync state of the trades
            var file = Config.SYNC_LOG_FILE;
            var dirname = path.dirname(file);
            if (!fs.existsSync(dirname)) {
                mkdirp.sync(dirname);
            }

            var fd = null;
            if (fs.existsSync(file)) {//file exists

                //according to doc - Open file for reading and writing.
                //An exception occurs if the file does not exist
                //So since we know that at this point the file exists we are not bothered about exception 
                //since it will definitely not be thrown

                fd = fs.openSync(file, 'r+');
            } else {//file does not exist

                //according to doc - Open file for reading and writing.
                //The file is created(if it does not exist) or truncated(if it exists).
                //So since we known that at this point it does not we are not bothered about the truncation

                fd = fs.openSync(file, 'w+');
            }


            var stats = fs.statSync(file);
            var size = stats['size'];
            var rq_size = size;
            var readPos = size > rq_size ? size - rq_size : 0;
            var length = size - readPos;
            var buffer = Buffer.alloc(length);

            if (length > 0) {

                fs.readSync(fd, buffer, 0, length, readPos);

                var data = buffer.toString(); //toString(0, length) did not work but toString() worked for me

                this.syncOpenTickectPairs = new Map(JSON.parse(data));
            }

        } catch (e) {
            console.log(e);
            throw e;
        }


        //set timer for ping
        setInterval(this.OnTimedPingEvent.bind(this), this.PING_INTERVAL);


        this.CheckRoutineSyncChecksInterval();
        this.CheckRoutineRefreshAccountInfoInterval();



        //run the service handler
        setImmediate(this.Handler.bind(this));

    }

    private CheckPlaceOrderTriggerPermission(trigger: PlaceOrderTrigger) {


        //Ensure no open position otherwise reject this add operation.
        //Since the strategy is mainly maintaining one open trade per account

        if (!trigger.buy_trader.Peer()) {
            ipcSend('place-order-trigger-rejected', `Peer for [${trigger.buy_trader.Broker(), trigger.buy_trader.AccountNumber()}] is null`);
            return;
        }

        if (trigger.buy_trader.OpenOrdersCount() > 0) {
            ipcSend('place-order-trigger-rejected', `Placing order trigger is not allowed if there is any open position - [${trigger.buy_trader.Broker(), trigger.buy_trader.AccountNumber()}] has at least one open position`);
            return false;
        }


        if (trigger.buy_trader.Peer().OpenOrdersCount() > 0) {
            ipcSend('place-order-trigger-rejected', `Placing order trigger is not allowed if there is any open position - [${trigger.buy_trader.Peer().Broker(), trigger.buy_trader.Peer().AccountNumber()}] has at least one open position`);
            return false;
        }

        return true;
    }

    public AddPlaceOrderTrigger(trigger: PlaceOrderTrigger) {

        if (!this.CheckPlaceOrderTriggerPermission(trigger)) {
            return;
        }

        this.PlaceOrdersTriggerList.push(trigger);

        ipcSend('place-order-triggers', this.PlaceOrderTriggersSafecopies());


        //TESTING STARTS

       /* setTimeout(function () {

            trigger.buy_trader.SetChartMarketPrice(1833.45);
            trigger.buy_trader.Peer().SetChartMarketPrice(1833.45);
        
        }, 0);

        setTimeout(function () {

            trigger.buy_trader.SetAccountCredit(49);
            trigger.buy_trader.Peer().SetAccountCredit(49);

            trigger.buy_trader.SetAccountBalance(149);
            trigger.buy_trader.Peer().SetAccountBalance(149);

            trigger.buy_trader.SetChartMarketPrice(1895.45);
            trigger.buy_trader.Peer().SetChartMarketPrice(1895.45);

        }, 20000);*/

        //TESTING ENDS

    }

    public CancelPlaceOrderTrigger(uuid: string) {
        
        let found = false;
        for (let i = 0; i < this.PlaceOrdersTriggerList.length; i++) {
            
            let trigger = this.PlaceOrdersTriggerList[i];
            if (trigger.uuid == uuid) {
                found = true;
                if (!trigger.is_triggered) {
                    this.PlaceOrdersTriggerList.splice(i, 1);

                    ipcSend('cancel-place-order-trigger-success', this.PlaceOrderTriggersSafecopies());
                } else {
                    ipcSend('cancel-place-order-trigger-fail', "Cannot cancel place order trigger already triggered.");
                }
            }
        }

        if (!found) {
            ipcSend('place-order-trigger-not-found', "Place order trigger not found.");
        }
    }
    
    private PlaceOrderTriggersSafecopies(): any[]{
        var arr = [];
        this.PlaceOrdersTriggerList.forEach(trigger => {
            arr.push(trigger.Safecopy());
        })

        return arr;
    }

    public SyncPlaceOrders(traderAccountBUY: TraderAccount,
        traderAccountA: TraderAccount,
        traderAccountB: TraderAccount,
        symbol: string,
        lot_size_a: number,
        lot_size_b: number,
        max_percent_diff_in_account_balances: number = Infinity,
        is_triggered: boolean = false) {

        if (!traderAccountBUY.Peer()) {
            return;
        }

        if (max_percent_diff_in_account_balances >= 0 && traderAccountA.AccountBalance() > 0 && traderAccountB.AccountBalance() > 0) {

            var perecent_a = Math.abs((traderAccountA.AccountBalance() - traderAccountB.AccountBalance()) / traderAccountA.AccountBalance() * 100);
            var perecent_b = Math.abs((traderAccountA.AccountBalance() - traderAccountB.AccountBalance()) / traderAccountB.AccountBalance() * 100);

            if (perecent_a > max_percent_diff_in_account_balances) {

                ipcSend('sync-place-order-reject', `Percent difference in account balance, ${traderAccountA.AccountBalance().toFixed(2)}${traderAccountA.AccountCurrency()} of [${traderAccountA.Broker()} , ${traderAccountA.AccountNumber()}]  from that of ${traderAccountB.AccountBalance().toFixed(2)}${traderAccountB.AccountCurrency()} of [${traderAccountB.Broker()} , ${traderAccountB.AccountNumber()}] which is ${perecent_a.toFixed(2)}% is greater than the allowable maximum of ${max_percent_diff_in_account_balances}%`);
                return;
            }

            if (perecent_b > max_percent_diff_in_account_balances) {

                ipcSend('sync-place-order-reject', `Percent difference in account balance, ${traderAccountB.AccountBalance().toFixed(2)}${traderAccountB.AccountCurrency()} of [${traderAccountB.Broker()} , ${traderAccountB.AccountNumber()}]  from that of  ${traderAccountA.AccountBalance().toFixed(2)}${traderAccountA.AccountCurrency()} of [${traderAccountA.Broker()} , ${traderAccountA.AccountNumber()}] which is ${perecent_b.toFixed(2)}% is greater than the allowable maximum of ${max_percent_diff_in_account_balances}%`);
                return;
            }
        }


        //clear off triggers for place order - the strategy does not permit allowing these triggers when any trade is open
        this.ClearPlaceOrderTriggers('Placing order has cleared off all pending triggers.');


        var paired_uuid = SyncUtil.Unique();
        var placementA: OrderPlacement = null;
        var placementB: OrderPlacement = null;

        if (traderAccountBUY.Broker() == traderAccountA.Broker()
            && traderAccountBUY.AccountNumber() == traderAccountA.AccountNumber()) {
            placementA = new OrderPlacement(paired_uuid, symbol, Constants.BUY, lot_size_a, is_triggered);
            placementB = new OrderPlacement(paired_uuid, symbol, Constants.SELL, lot_size_b, is_triggered);
        } else {
            placementA = new OrderPlacement(paired_uuid, symbol, Constants.SELL, lot_size_a, is_triggered);
            placementB = new OrderPlacement(paired_uuid, symbol, Constants.BUY, lot_size_b, is_triggered);
        }

        traderAccountBUY.SyncPlacingOrders.set(paired_uuid, placementA);
        traderAccountBUY.Peer().SyncPlacingOrders.set(paired_uuid, placementB);

        //traderAccountBUY.PlaceOrder(placementA); //old
        //traderAccountBUY.Peer().PlaceOrder(placementB);//old

        traderAccountBUY.ValidatePlaceOrder(placementA); //new
        traderAccountBUY.Peer().ValidatePlaceOrder(placementB);//new

    }


    public GetEmailer(): Emailer { return this.emailer; }


    public AddClient(traderAccount: TraderAccount) {
        this.unpairedAccounts.push(traderAccount);
    }

    private OnTimedPingEvent() {

        this.eachAccount((acct: TraderAccount) => {
            acct.Ping();
        });

    }

    private IsAlive(traderAccount: TraderAccount): boolean {
        if (traderAccount.IsConnected())
            return true;

        //at this piont the connection is closed

        this.RemovePairing(traderAccount, true);//force remove pairing

        //dispose since we have unpaired it

        for (let unpaired of this.unpairedAccounts) {
            if (unpaired.Broker() === traderAccount.Broker()
                && unpaired.AccountNumber() === traderAccount.AccountNumber()
            ) {
                SyncUtil.ArrayRemove(this.unpairedAccounts, traderAccount);//remove from unpaired list
                traderAccount.Dispose();
                traderAccount = null;
                break;
            }
        }

        return false;
    }

    public RemovePairing(traderAccount: TraderAccount, force_remove: boolean = false) {

        if (!force_remove && traderAccount.IsSyncingInProgress()) {

            ipcSend('could-not-remove-pairing', {
                account: traderAccount.Safecopy(),
                feedback: `Could not remove pairing of ${traderAccount.Broker()}, ${traderAccount.AccountNumber()}.\n`
                    + `Action denied because order syncing was detected!\n`
                    + `It is unsafe to remove pairing when syncing is in progress except if it arised from account disconnection.`,
            });

            return;
        }

        for (let pair of this.pairedAccounts) {
            //consider first element of the pair
            if (pair[0] === traderAccount || pair[1] === traderAccount) {

                SyncUtil.ArrayRemove(this.pairedAccounts, pair);

                this.unpairedAccounts.push(pair[0]);//return back to unpaired list
                this.unpairedAccounts.push(pair[1]);//return back to unpaired list

                pair[0].ResetOrdersSyncing();//reset all orders syncing to false
                pair[1].ResetOrdersSyncing();//reset all orders syncing to false

                pair[0].RemovePeer();
                pair[1].RemovePeer();

                ipcSend('unpaired', [pair[0].Safecopy(), pair[1].Safecopy()]);

                break;
            }

        }

    }

    private eachAccount(callback: Function) {
        try {

            for (let unpaired of this.unpairedAccounts) {

                if (this.IsAlive(unpaired)) {
                    callback(unpaired);
                }

            }


            for (let pair of this.pairedAccounts) {

                if (this.IsAlive(pair[0])) {
                    callback(pair[0]);
                }

                if (this.IsAlive(pair[1])) {
                    callback(pair[1]);
                }

            }
        }
        catch (ex) {
            console.log(ex);
        }

    }

    private eachPairedAccount(callback: Function) {
        try {

            for (let pair of this.pairedAccounts) {
                this.IsAlive(pair[0]);
                this.IsAlive(pair[1]);
                callback(pair[0]);
                callback(pair[1]);

            }
        }
        catch (ex) {
            console.log(ex);
        }

    }

    private CheckRoutineSyncChecksInterval() {

        //set timer for routine validation checks  

        var secs = this.RoutineSyncChecksInterval();
        if (this.LastRoutineSyncChecksInterval != secs) {
            clearTimeout(this.RoutineSyncChecksIntervalID);
            this.RoutineSyncChecksIntervalID = setInterval(this.RevalidateSyncAll.bind(this), secs);
            this.LastRoutineSyncChecksInterval = secs;
        }
    }

    private CheckRoutineRefreshAccountInfoInterval() {

        //set timer for refreshing account info on the gui    
        var secs = this.RoutineRefreshAccountInfoInterval();
        if (this.LastRoutineRefreshAccountInfoInterval != secs) {
            clearTimeout(this.RoutineRefreshAccountInfoIntervalID);
            this.RoutineRefreshAccountInfoIntervalID = setInterval(this.RefreshAccountInfo.bind(this), secs);
            this.LastRoutineRefreshAccountInfoInterval = secs;
        }
    }

    private HandlePlaceOrderTriggers() {
        var any_triggered = false;
        for (let trigger of this.PlaceOrdersTriggerList) {
            if (!trigger.VerifyPair()) {
                continue;
            }
            if (!trigger.IsAccountBalanceDifferenceAllowed()) {
                continue;
            }

            if (trigger.type == Constants.Instant_when_both_accounts_have_credit_bonuses
                || trigger.type == Constants.Pending_at_price_when_both_accounts_have_credit_bonuses) {

                if (!trigger.IsBothAccountsHaveCredits()) {
                    continue;
                }
            }

            if (trigger.type == Constants.Pending_at_price
                || trigger.type == Constants.Pending_at_price_when_both_accounts_have_credit_bonuses) {
                if (!trigger.IsPriceTrigger()) {
                    continue;
                }
            }

            //finally at this point there is a trigger
            any_triggered = true;

            this.PlaceOrderByTriger(trigger);

            break;
        }

        if (any_triggered) {//clear all triggers if any is triggered
            this.ClearPlaceOrderTriggers('All other triggers cleared off.');
        }

    }

    private ClearPlaceOrderTriggers(message: string = '') {

        if (this.PlaceOrdersTriggerList.length > 0) {
            this.PlaceOrdersTriggerList = new Array<PlaceOrderTrigger>(); // initialize

            ipcSend('place-order-triggers-clear', message);
        }
    }


    PlaceOrderByTriger(trigger: PlaceOrderTrigger) {
        if (!this.CheckPlaceOrderTriggerPermission(trigger)) {
            return;
        }

        trigger.is_triggered = true;

        this.SyncPlaceOrders(trigger.buy_trader,
            trigger.buy_trader,
            trigger.buy_trader.Peer(),//sell trader
            trigger.symbol,
            trigger.buy_lot_size,
            trigger.sell_lot_size,
            trigger.max_percent_diff_in_account_balances,
            true);


    }

    private Handler() {


        this.CheckRoutineSyncChecksInterval();
        this.CheckRoutineRefreshAccountInfoInterval();

        this.eachAccount((acct: TraderAccount) => {
            if (acct.HasReceived()) {
                this.HandleRead(acct, acct.ReceiveData());
            }
            try {
                this.emailer.Handler(acct);
                this.CheckPossibleLossPrevention(acct);
            } catch (ex) {
                console.log(ex);
            }

        });

        this.HandlePlaceOrderTriggers();

        setImmediate(this.Handler.bind(this));

    }


    private SendCopyToPeer(traderAccount: TraderAccount) {
        traderAccount.SendCopy(this.GetUnSyncedOrders(traderAccount));
    }

    private SendCloseToPeer(traderAccount: TraderAccount) {
        traderAccount.SendClose(this.GetSyncedOrders(traderAccount));
    }
    
    private SendModifyToPeer(traderAccount: TraderAccount) {
        traderAccount.SendModify(this.GetSyncedOrders(traderAccount));
    }

    public PairTraderAccountWith(traderAccount: TraderAccount, peerAccount: TraderAccount, is_gui: boolean = false) {
        if (traderAccount == null || peerAccount == null) {
            if (is_gui) {
                ipcSend('paired-fail', 'one or two of the account to pair with is null.');
            }
            return;
        }

        if (!traderAccount.IsKnown() || !peerAccount.IsKnown()) {
            if (is_gui) {
                ipcSend('paired-fail', 'one or two of the account to pair with is unknown - possibly no broker name or account number');
            }
            return;
        }

        if (traderAccount.Version() != peerAccount.Version()) {
            if (is_gui) {
                ipcSend('paired-fail', `EA version of [${traderAccount.Broker()}, ${traderAccount.AccountNumber()}] (${traderAccount.Version()}) mismatch with that of [${peerAccount.Broker()}, ${peerAccount.AccountNumber()}] (${peerAccount.Version()})  - version must be the same`);
            }
            return;
        }


        if (traderAccount.IsLiveAccount() === null) {
            if (is_gui) {
                ipcSend('paired-fail', `account type of [${traderAccount.Broker()}, ${traderAccount.AccountNumber()}] is unknown  - must be live or demo`);
            }
            return;
        }


        if (peerAccount.IsLiveAccount() === null) {
            if (is_gui) {
                ipcSend('paired-fail', `account type of [${peerAccount.Broker()}, ${peerAccount.AccountNumber()}] is unknown  - must be live or demo`);
            }
            return;
        }


        if (traderAccount.IsLiveAccount() !== peerAccount.IsLiveAccount()) {
            if (is_gui) {
                ipcSend('paired-fail', 'cannot pair up two accounts of different types - they both must be live or demo');
            }
            return;
        }



        if (this.IsPaired(traderAccount)) {
            if (is_gui) {
                ipcSend('already-paired', `[${traderAccount.Broker()}, ${traderAccount.AccountNumber()}] `
                                            +`is already paired with [${traderAccount.Peer().Broker()}, ${traderAccount.Peer().AccountNumber()}]!`);
            }
            return;
        }

        if (this.IsPaired(peerAccount)) {
            if (is_gui) {
                ipcSend('already-paired', `[${peerAccount.Broker()}, ${peerAccount.AccountNumber()}] `
                    + `is already paired with [${peerAccount.Peer().Broker()}, ${peerAccount.Peer().AccountNumber()}]!`);
            }
            return;
        }

        if (SyncUtil.AppConfigMap.get('only_pair_live_accounts_with_same_account_name') === true) {

            if (traderAccount.IsLiveAccount()
                && peerAccount.IsLiveAccount()
                && traderAccount.AccountName().toLowerCase() != peerAccount.AccountName().toLowerCase()) {
                if (is_gui) {
                    ipcSend('paired-fail', `Your app configuration settings does not permit pairing two live accounts with different account name:`
                        + `\n\nBroker: ${traderAccount.Broker()}\nAccount Number: ${traderAccount.AccountNumber()}\nAccount Name: ${traderAccount.AccountName()}`
                        + `\n---------------\nBroker: ${peerAccount.Broker()}\nAccount Number: ${peerAccount.AccountNumber()}\nAccount Name: ${peerAccount.AccountName()}`
                        + `\n\nHint: You can deselect the option in your app settings to remove this restriction.`);
                }
                return;
            }

        }

        for (let otherAccount of this.unpairedAccounts) {

            if (otherAccount != peerAccount) {
                continue;
            }

            //pair up the trader account

            traderAccount.SetPeer(otherAccount);
            otherAccount.SetPeer(traderAccount);

            let paired: PairAccount = [null, null];

            //assign to the appropriate column index
            paired[otherAccount.PairColumnIndex()] = otherAccount;
            paired[traderAccount.PairColumnIndex()] = traderAccount;

            this.pairedAccounts.push(paired);

            //remove from the unpaired list    
            SyncUtil.ArrayRemove(this.unpairedAccounts, otherAccount);
            SyncUtil.ArrayRemove(this.unpairedAccounts, traderAccount);

            //now copy each other trades if neccessary
            this.SendCopyToPeer(traderAccount);
            this.SendCopyToPeer(otherAccount);

            traderAccount.EnsureTicketPeer(this.syncOpenTickectPairs);

            ipcSend('paired', traderAccount.Safecopy());

            break;
        }

    }

    private handleDuplicateEA(traderAccount: TraderAccount) {
        //TODO
        console.log("TODO Duplicate EA detected!");
    }

    public getTraderAccount(broker: string, account_number: string): TraderAccount {

        for (let unpaired of this.unpairedAccounts) {
            if (unpaired.Broker() === broker
                && unpaired.AccountNumber() === account_number
            ) {
                return unpaired;
            }
        }

        for (let pair of this.pairedAccounts) {
            //check the first
            if (pair[0].Broker() === broker
                && pair[0].AccountNumber() === account_number
            ) {
                return pair[0];
            }

            //checkt the second
            if (pair[1].Broker() === broker
                && pair[1].AccountNumber() === account_number
            ) {
                return pair[1];
            }
        }

        return null;
    }

    private getPeer(traderAccount: TraderAccount): TraderAccount {

        for (let pair of this.pairedAccounts) {
            //check the first
            if (pair[0].Broker() === traderAccount.Broker()
                && pair[0].AccountNumber() === traderAccount.AccountNumber()

                && (pair[1].Broker() !== traderAccount.Broker()
                    || pair[1].AccountNumber() !== traderAccount.AccountNumber())
            ) {
                return pair[1];
            }

            //chect the second
            if (pair[1].Broker() === traderAccount.Broker()
                && pair[1].AccountNumber() === traderAccount.AccountNumber()

                && (pair[0].Broker() !== traderAccount.Broker()
                    || pair[0].AccountNumber() !== traderAccount.AccountNumber())
            ) {
                return pair[0];
            }
        }

        return null;
    }

    private IsPaired(traderAccount: TraderAccount): boolean {
        return this.getPeer(traderAccount) != null;
    }
    
    private OnModifyTargetResult(traderAccount: TraderAccount, ticket: number, origin_ticket: number, new_target: number,success: boolean, error: string) {

        if (traderAccount == null) return;

        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null) return;

        var origin_order = peerAccount.GetOrder(origin_ticket);
        if (origin_order) {
            origin_order.SyncModifyingTarget(false);
        }


        if (!success && error != Constants.trade_condition_not_changed && error != Constants.no_changes) {
            var peer: TraderAccount = traderAccount.Peer();
            if (peer) {
                peer.RetrySendModifyTarget(origin_ticket, ticket, new_target);
            }
            return;
        }
        

    }

    private OnModifyStoplossResult(traderAccount: TraderAccount, ticket: number, origin_ticket: number, new_stoploss: number, success: boolean, error: string) {

        if (traderAccount == null) return;

        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null) return;

        var origin_order = peerAccount.GetOrder(origin_ticket);
        if (origin_order) {
            origin_order.SyncModifyingStoploss(false);
        }


        if (!success && error != Constants.trade_condition_not_changed && error != Constants.no_changes) {
            var peer: TraderAccount = traderAccount.Peer();
            if (peer) {
                peer.RetrySendModifyStoploss(origin_ticket, ticket, new_stoploss);
            }
            return;
        }


    }

    private DoOrderPair(traderAccount: TraderAccount, peerAccount: TraderAccount,  ticket: number, peer_ticket: number) {

        let pairId = traderAccount.PairID();
        let open_tickect_pairs: Array<PairTicket> = new Array<PairTicket>();

        if (this.syncOpenTickectPairs.get(pairId)) {
            open_tickect_pairs = this.syncOpenTickectPairs.get(pairId);
        }
        else {
            open_tickect_pairs = new Array<PairTicket>();
        }


        let paired_tickets: PairTicket = [null, null];

        //assign to the appropriate column index
        paired_tickets[traderAccount.PairColumnIndex()] = ticket;
        paired_tickets[peerAccount.PairColumnIndex()] = peer_ticket;

        open_tickect_pairs.push(paired_tickets);
        this.syncOpenTickectPairs.set(pairId, open_tickect_pairs);

        traderAccount.EnsureTicketPeer(this.syncOpenTickectPairs);

        this.SaveSyncState();
    }

    public handlePendingAccountOrderPlacement(uuid: string, send: boolean) {
        var accPl: Array<AccountOrderPlacement> = this.pendingAccountPlacementOrderMap.get(uuid);
        if (!accPl) {
            return;
        }
        if (send) {
            var traderAccount: TraderAccount = accPl[0][0];
            var placement: OrderPlacement = accPl[0][1];

            var peerAccount: TraderAccount = accPl[1][0];
            var peer_placement: OrderPlacement = accPl[1][1];

            //now send
            traderAccount.PlaceOrder(placement);
            peerAccount.PlaceOrder(peer_placement);
        }

        this.pendingAccountPlacementOrderMap.delete(uuid);
    }

    private OnValidatePlaceOrderResult(traderAccount: TraderAccount, uuid: string, spread_cost: number, required_margin: number, success: boolean, error: string) {

        if (traderAccount == null) return;

        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null) return;

        var placement: OrderPlacement = traderAccount.SyncPlacingOrders.get(uuid);
        var peer_placement: OrderPlacement = peerAccount.SyncPlacingOrders.get(uuid);

        if (!success) {
            
            traderAccount.SyncPlacingOrders.delete(uuid);
            peerAccount.SyncPlacingOrders.delete(uuid);

            ipcSend('validate-place-order-fail', traderAccount.Safecopy());

            return;
        }

        if (!placement) {//already deleted
            return;
        }

        placement.SetValidateResult(success, error);
        placement.SetSpreadCost(spread_cost);
        placement.SetRequiredMargin(required_margin);

        if (placement.state != Constants.VALIDATION_SUCCESS || peer_placement.state != Constants.VALIDATION_SUCCESS) {
            return;//one done
        }

        if (SyncUtil.AppConfigMap.get('show_waning_message_if_loss_is_possible') == true) {

            var aop1: AccountOrderPlacement = [traderAccount, placement];
            var aop2: AccountOrderPlacement = [peerAccount, peer_placement];

            this.pendingAccountPlacementOrderMap.set(uuid, [aop1, aop2]);

            var crashAccount: TraderAccount = null;

            var possibleLossA = this.HedgePossibleLoss(traderAccount, placement, peer_placement);
            var possibleLossB = this.HedgePossibleLoss(peerAccount, peer_placement, placement);

            var possible_loss: number = possibleLossA < possibleLossB ? possibleLossA : possibleLossB;
            if (possibleLossA < possibleLossB) {
                possible_loss = possibleLossA;
                crashAccount = traderAccount;
            } else {
                possible_loss = possibleLossB;
                crashAccount = peerAccount;
            }

            if (possible_loss < 0) {
                if (!placement.is_triggered) { 
                    ipcSend('show-place-order-warning-alert', {
                        warning: this.LossWaringMessage(crashAccount, possible_loss),
                        uuid: uuid
                    });
                } else {//for the case triggered order no need for warning alert. Just reject the order
                    ipcSend('place-order-trigger-rejected', this.LossRejectionMessage(crashAccount, possible_loss));
                }
            }

        } else {
            traderAccount.PlaceOrder(placement);
            peerAccount.PlaceOrder(peer_placement);
        }

        return;//both done

    }

    private HedgePossibleLoss(account: TraderAccount, placement: OrderPlacement, peer_placement: OrderPlacement): number {
        if (!account.Peer()) return 0;

        var peerAccount = account.Peer();

        var stopout_amount: number  = account.AccountStopoutLevel() * placement.required_margin / 100;
        var eatable_margin: number = placement.required_margin - stopout_amount;

        var eatable_amount: number = account.AccountCredit() < eatable_margin ? account.AccountCredit() : eatable_margin;//smaller amount is eatable
        
        var possible_loss = eatable_amount - Math.abs(placement.spread_cost) - Math.abs(peer_placement.spread_cost)

        possible_loss = parseFloat(possible_loss.toFixed(2));

        return possible_loss;
    }

    private ComputeHedgeProfit(account: TraderAccount) {

        if (!account.Peer()) {
            return;
        }

        var stopout_amount: number = account.AccountStopoutLevel() * account.AccountMargin() / 100;
        var margin_drop: number = account.AccountMargin() - stopout_amount;

        var eatable_amount: number = account.AccountCredit() < margin_drop ? account.AccountCredit() : margin_drop;//smaller amount is eatable

        var hedge_profit = eatable_amount - Math.abs(account.AccountTradeCost()) - Math.abs(account.Peer().AccountTradeCost())

        hedge_profit = parseFloat(hedge_profit.toFixed(2));

        account.SetHedgeProfit(hedge_profit);

        //for tomorrow
        var hedge_profit_tomorrow = account.HedgeProfit() + account.AccountSwapPerDay();

        hedge_profit_tomorrow = parseFloat(hedge_profit_tomorrow.toFixed(2));

        account.SetHedgeProfitTomorrow(hedge_profit_tomorrow);
    }

    private LossWaringMessage(crashAccount: TraderAccount, possible_loss: number) {

        return `You may loss up to ${possible_loss} ${crashAccount.AccountCurrency()} on this sync trading position if account ${crashAccount.AccountNumber()} on ${crashAccount.Broker()} crashes.`;
    }

    private LossRejectionMessage(crashAccount: TraderAccount, possible_loss: number) {

        return `Place order trigger was rejected because of possible loss of up to ${possible_loss} ${crashAccount.AccountCurrency()} on this sync trading position if account ${crashAccount.AccountNumber()} on ${crashAccount.Broker()} crashes.`;
    }

    private OnPlaceOrderResult(traderAccount: TraderAccount, ticket: number,  uuid: string ,success: boolean) {

        if (traderAccount == null) return;

        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null) return;

        var placement: OrderPlacement = traderAccount.SyncPlacingOrders.get(uuid);
        var peer_placement: OrderPlacement = peerAccount.SyncPlacingOrders.get(uuid);

        if (!success) {
            if (!peerAccount.IsPlacementOrderClosed(uuid)) {//ensuring the peer order placement has not already closed
                var placement: OrderPlacement = traderAccount.SyncPlacingOrders.get(uuid);
                traderAccount.RetrySendPlaceOrderOrForceClosePeer(placement);
            } else {
                //Oops!!! the peer order placement has closed so just cancel and clear off the entries

                traderAccount.SyncPlacingOrders.delete(uuid);
                peerAccount.SyncPlacingOrders.delete(uuid);
            }
            return;
        }

        placement.SetResult(ticket);
        placement.SetOperationCompleteStatus(OrderPlacement.COMPLETE_SUCCESS);

        var order = traderAccount.GetOrder(ticket);
        if (order) {
            order.SetCopyable(false);
        }

        //if peer did not complete with success status then focibly close this order
        if (peer_placement.OperationCompleteStatus() == OrderPlacement.COMPLETE_FAIL) {
            var ticket: number = placement.ticket;
            var reason: string = traderAccount.ForceCloseReasonForFailedOrderPlacement(ticket);
            traderAccount.ForceCloseMe(ticket, reason);//forcibly close this order
            return 1;
        }
        

        if (placement.state != Constants.SUCCESS || peer_placement.state != Constants.SUCCESS) {
            return 1;//one done
        }

        this.DoOrderPair(traderAccount, peerAccount, placement.ticket, peer_placement.ticket);

        //clear off the placement orders entries
        traderAccount.SyncPlacingOrders.delete(uuid);
        peerAccount.SyncPlacingOrders.delete(uuid);

        return 2;//both done
        
    }

    private OnCopyResult(traderAccount: TraderAccount, ticket: number, origin_ticket: number, success: boolean) {

        if (traderAccount == null) return;

        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null) return;

        var origin_order = peerAccount.GetOrder(origin_ticket);
        if (origin_order) {
            origin_order.SyncCopying(false);
        }

        if (!success) {
            var peer: TraderAccount = traderAccount.Peer();
            if (peer) {
                peer.RetrySendCopyOrForceCloseMe(origin_ticket);
            }
            return ;
        }


        this.DoOrderPair(traderAccount, peerAccount, ticket, origin_ticket);
    }


    private OnCloseResult(traderAccount: TraderAccount, ticket: number, origin_ticket: number, success: boolean) {

        if (traderAccount == null) return;

        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null) return;

        var origin_order = peerAccount.GetOrder(origin_ticket);
        if (origin_order) {
            origin_order.Closing(false);
        }


        if (!success) {
            var peer: TraderAccount = traderAccount.Peer();
            if (peer) {
                peer.RetrySendClose(origin_ticket, ticket);
            }
            return;
        }

        this.FinalizeCloseSuccess(traderAccount, ticket);
    }

    private OnOwnCloseResult(traderAccount: TraderAccount, ticket: number,  success: boolean) {

        if (traderAccount == null) return;

        var order = traderAccount.GetOrder(ticket);
        if (order) {
            order.Closing(false);
        }


        if (!success) {            
            traderAccount.RetrySendClose(ticket, ticket);            
            return;
        }

        //before we finalize lets ensure the peer order is also closed

        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null) return;

        var peer_order = peerAccount.GetOrder(order.peer_ticket);

        if (order.IsClosed() && peer_order && peer_order.IsClosed()) {
            this.FinalizeCloseSuccess(traderAccount, ticket);        
        }
        
    }

    private FinalizeCloseSuccess(traderAccount: TraderAccount, ticket: number) {

        let pairId = traderAccount.PairID();


        let open_tickect_pairs: Array<PairTicket> = new Array<PairTicket>();

        if (this.syncOpenTickectPairs.get(pairId)) {
            open_tickect_pairs = this.syncOpenTickectPairs.get(pairId);
        }
        else {
            open_tickect_pairs = new Array<PairTicket>();
        }

        //Remove the paired order ticket from the list
        for (let ticket_pair of open_tickect_pairs) {
            let own_ticket: number = ticket_pair[traderAccount.PairColumnIndex()];
            if (own_ticket === ticket) {
                SyncUtil.ArrayRemove(open_tickect_pairs, ticket_pair);
                //transfer to closed ticket pairs
                var closed_ticket_pairs = this.syncClosedTickectPairs.get(pairId);
                if (!closed_ticket_pairs) {
                    closed_ticket_pairs = new Array<PairTicket>();
                }
                closed_ticket_pairs.push(ticket_pair);
                this.syncClosedTickectPairs.set(pairId, closed_ticket_pairs);
                break;
            }
        }

        this.syncOpenTickectPairs.set(pairId, open_tickect_pairs);

        this.SaveSyncState();
    }
    /**
     * These are orders that have not been paired with its peer
     */

    private GetUnSyncedOrders(traderAccount: TraderAccount): Array<Order> {
        let unsync_orders: Array<Order> = new Array<Order>();

        let peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null)
            return [];//yes empty since it is not even paired to any account

        var orders = traderAccount.Orders();

        var pairId = traderAccount.PairID();

        var open_tickect_pairs: PairTicket[] = this.syncOpenTickectPairs.get(pairId);
        var closed_tickect_pairs: PairTicket[] = this.syncClosedTickectPairs.get(pairId);
        
        if (!open_tickect_pairs)
            return orders;//meaning no order has been synced so return all

        if (!closed_tickect_pairs) {
            closed_tickect_pairs = new Array<PairTicket>();
        }


        //at this point they are paired so get the actuall unsynced orders

        for (let order of orders) {
            var order_ticket = order.ticket;
            var found = false;

            //check in open paired tickets
            for (let ticket_pair of open_tickect_pairs) {
                let own_ticket: number = ticket_pair[traderAccount.PairColumnIndex()];
                if (own_ticket === order_ticket) {
                    found = true;
                    break;
                }
            }

            //also check in closed paired tickets
            for (let ticket_pair of closed_tickect_pairs) {
                let own_ticket: number = ticket_pair[traderAccount.PairColumnIndex()];
                if (own_ticket === order_ticket) {
                    found = true;
                    console.log(`found int closed tickets ${order_ticket}`);
                    break;
                }
            }


            if (!found) {           
                unsync_orders.push(order);
            }
        }

        return unsync_orders;
    }


    /**
     * These are orders that have been paired with its peer
     */
    private GetSyncedOrders(traderAccount: TraderAccount): Array<PairOrder> {
        var synced_orders: Array<PairOrder> = new Array<PairOrder>();
        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null)
            return synced_orders;

        var pairId = traderAccount.PairID();

        if (!this.syncOpenTickectPairs.get(pairId))
            return synced_orders;

        var syncTickects: PairTicket[] = this.syncOpenTickectPairs.get(pairId);

        var order_pairs_not_found: Array<PairTicket> = new Array<PairTicket>();

        var row = -1;
        for (let ticket_pair of syncTickects) {
            row++;
            let own_column: number = traderAccount.PairColumnIndex();
            let peer_column: number = peerAccount.PairColumnIndex();
            let own_ticket: number = ticket_pair[own_column];
            let peer_ticket: number = ticket_pair[peer_column];

            let own_order: Order = traderAccount.GetOrder(own_ticket);
            let peer_order: Order = peerAccount.GetOrder(peer_ticket);

            if (!own_order || !peer_order) {//for case where the order does not exist
                order_pairs_not_found.push(ticket_pair);
                continue;
            }

            let paired: PairOrder = [null, null];
            paired[own_column] = own_order;
            paired[peer_column] = peer_order;

            synced_orders.push(paired);

        }

        //purge out orders not found
        for (let ticket_pair of order_pairs_not_found) {
            SyncUtil.ArrayRemove(this.syncOpenTickectPairs.get(pairId), ticket_pair);
        }

        return synced_orders;
    }

    GetPairedOwnTicketUsingPeerTicket(traderAccount: TraderAccount, peer_ticket: number): number {
        var synced_orders: Array<PairOrder> = new Array<PairOrder>();
        var peerAccount = this.getPeer(traderAccount);

        if (peerAccount == null)
            return null;

        var pairId = traderAccount.PairID();

        if (!this.syncOpenTickectPairs.get(pairId))
            return null;

        var syncTickects: PairTicket[] = this.syncOpenTickectPairs.get(pairId);

        for (let pair_ticket of syncTickects) {
            let own_column: number = traderAccount.PairColumnIndex();
            let peer_column: number = peerAccount.PairColumnIndex();
            if (pair_ticket[peer_column] == peer_ticket) {
                return pair_ticket[own_column];
            }
        }

        return null;
    }

    private SaveSyncState() {
        var data =  JSON.stringify(Array.from(this.syncOpenTickectPairs.entries()));

        //overwrite the file content
        fs.writeFile(Config.SYNC_LOG_FILE, data, { encoding: 'utf8', flag: 'w' }, function (err) {
            if (err) {
                return console.log(err);
            }
        })

    }

    public RefreshAccountInfo(): void {
        
        this.eachPairedAccount((account: TraderAccount) => {
            ipcSend('account-info', account.Safecopy());
        });
    }

    public  RevalidateSyncAll(): void {

        console.log("Revalidating all sync begins...");

        this.eachPairedAccount((account: TraderAccount) => {
            if (!account.IsMarketClosed()) {
                this.RevalidateSyncCopy(account);
                this.RevalidateSyncClose(account);
                this.RevalidateSyncModify(account);
            }
        });

        /*
        //TESTING!!! TO BE REMOVE
        if (this.pairedAccounts[0] && this.pairedAccounts[0][0].Orders()[0]) {//TESTING!!! TO BE REMOVE
            this.pairedAccounts[0][0].Orders()[0].SyncCopying(true);
            ipcSend('sending-sync-copy', {
                account: this.pairedAccounts[0][0].Safecopy(),
                order: this.pairedAccounts[0][0].Orders()[0]
            });
        }*/
    }


    private RevalidateSyncCopy(account: TraderAccount): void {

        console.log("Revalidating copy sync...");

        this.SendCopyToPeer(account);

    }


    private RevalidateSyncClose(account: TraderAccount): void {

        console.log("Revalidating close sync...");

        this.SendCloseToPeer(account);
    }

    private RevalidateSyncModify(account: TraderAccount): void {

        console.log("Revalidating modify sync...");

        this.SendModifyToPeer(account);
    }

    private HandleRead(account: TraderAccount, data: string) {

        if (data == null || data.length == 0)
            return;

        if (data != "ping=pong") {
            console.log(`[${account.StrID()}] `, data);//TESTING!!!
        }

        let intro: boolean = false;
        let is_stoploss_changed: boolean = false;
        let peer_broker: string = null;
        let peer_account_number: string = null;
        let ticket: number = null;
        let origin_ticket: number = null;
        let is_copy_trades: boolean = false;
        let is_close_trades: boolean = false;
        let is_modify_trades: boolean = false;
        let is_account_balance_changed: boolean = false;
        let validate_place_order_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
        let place_order_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
        let copy_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
        let own_close_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
        let close_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
        let modify_target_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
        let modify_stoploss_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false 
        let error: string = "";
        let uuid: string = "";
        let force: boolean = false;
        let reason: string = "";
        var token = data.split(Constants.TAB);
        let new_target: number = 0;
        let new_stoploss: number = 0;
        let fire_market_closed = false;
        let fire_market_opened = false;
        let spread_cost: number = 0;
        let required_margin: number = 0;
        

        for (var i = 0; i < token.length; i++) {
            var split = token[i].split('=');
            var name = split[0];
            var value = split[1];

            if (name == "is_market_closed") {
                
                if (value == "true") {
                    //check if the previous state was open
                    if (!account.IsMarketClosed()) {
                        fire_market_closed = true;
                    }

                    account.SetMarketClosed(true);
                } else {
                    //check if the previous state was close
                    if (account.IsMarketClosed()) {
                        fire_market_opened = true;
                    }


                    account.SetMarketClosed(false);
                }
            }

            if (name == "ping") {
                return;
            }
            if (name == "intro" && value == "true") {
                intro = true;
            }

            if (name == "uuid") {
                uuid = value;
            }

            if (name == "version") {
                account.SetVersion(value);
            }

            if (name == "broker") {
                var normalize_broker: string = SyncUtil.NormalizeName(value);
                account.SetBroker(normalize_broker);
            }

            if (name == "terminal_path") {
                account.SetIconFile(`${value}${path.sep}${Config.TERMINAL_ICON_NAME}${Config.TERMINAL_ICON_TYPE}`);
            }

            if (name == "account_number") {
                account.SetAccountNumber(value);
            }

            if (name == "account_name") {
                account.SetAccountName(value);
            }

            if (name == "account_balance") {
                account.SetAccountBalance(parseFloat(value));
            }

            if (name == "account_equity") {
                account.SetAccountEquity(parseFloat(value));
            }

            if (name == "account_credit") {
                account.SetAccountCredit(parseFloat(value));
            }

            if (name == "account_currency") {
                account.SetAccountCurrency(value);
            }

            if (name == "account_leverage") {
                account.SetAccountLeverage(parseFloat(value));
            }

            if (name == "account_margin") {
                account.SetAccountMargin(parseFloat(value));
            }

            if (name == "account_stopout_level") {
                account.SetAccountStopoutLevel(parseFloat(value));
            }

            if (name == "account_profit") {
                account.SetAccountProfit(parseFloat(value));
            }

            if (name == "account_free_margin") {
                account.SetAccountFreeMargin(parseFloat(value));
            }

            if (name == "account_swap_per_day") {
                account.SetAccountSwapPerDay(parseFloat(value));
            }

            if (name == "chart_symbol") {
                account.SetChartSymbol(value);
            }

            if (name == "chart_market_price") {
                account.SetChartMarketPrice(parseFloat(value));
            }

            if (name == "platform_type") {
                account.SetPlatformType(value);
            }

            

            if (name == "peer_broker") {
                peer_broker = SyncUtil.NormalizeName(value);
            }

            if (name == "peer_account_number") {
                peer_account_number = value;
            }


            if (name == "trade_copy_type") {
                account.SetTradeCopyType(value);
            }
           
            if (name == "is_live_account" && value=="true") {
                account.SetIsLiveAccount(true);
            } else if (name == "is_live_account" && value == "false") {
                account.SetIsLiveAccount(false);
            }

            if (name == "ticket") {
                var intValue = parseInt(value);
                if (intValue > -1) {
                    ticket = intValue;
                    account.SetOrder(ticket);
                    account.EnsureTicketPeer(this.syncOpenTickectPairs);
                    account.EnsureTicketPeer(this.syncClosedTickectPairs);
                }
            }

            if (name == "force") {
                force = value == "true";
                var order: Order = account.GetOrder(ticket);
                order.force = force;
            }

            if (name == "reason") {
                reason = value;
                var order: Order = account.GetOrder(ticket);
                order.reason = reason;
            }

            if (name == "origin_ticket") {
                origin_ticket = parseInt(value);
            }

            if (name == "symbol") {
                account.GetOrder(ticket).symbol = value;
            }

            if (name == "raw_symbol") {
                account.GetOrder(ticket).raw_symbol = value;
            }

            if (name == "position") {
                account.GetOrder(ticket).position = value;
            }

            if (name == "default_spread") {
                account.GetOrder(ticket).SetDefaultSpread(Number.parseFloat(value));
            }

            if (name == "point") {
                account.GetOrder(ticket).point = Number.parseFloat(value);
            }

            if (name == "open_price") {
                account.GetOrder(ticket).open_price = Number.parseFloat(value);
            } 

            if (name == "close_price") {
                account.GetOrder(ticket).close_price = Number.parseFloat(value);
            } 

            if (name == "lot_size") {
                account.GetOrder(ticket).lot_size = Number.parseFloat(value);
            }

            if (name == "target") {
                account.GetOrder(ticket).target = Number.parseFloat(value);
            }

            if (name == "stoploss") {
                account.GetOrder(ticket).stoploss = Number.parseFloat(value);
            }       
            
            if (name == "close_time") {
                var order: Order = account.GetOrder(ticket);
                var was_close = order.close_time > 0;
                order.close_time = Number.parseInt(value);
                if (!was_close && order.close_time > 0) {//just closed
                    this.emailer.OrderCloseNotify(account, order);
                }
            }

            if (name == "open_time") {
                var order: Order = account.GetOrder(ticket);
                var was_open = order.open_time > 0;
                order.open_time = Number.parseInt(value);
                if (!was_open && order.open_time > 0) {//just opened
                    this.emailer.OrderOpenNotify(account, order);
                }
            }

            if (name == "stoploss_change_time") {
                account.GetOrder(ticket).stoploss_change_time = Number.parseInt(value);
            }

            if (name == "target_change_time") {
                account.GetOrder(ticket).target_change_time = Number.parseInt(value);
            }

            if (name == "copy_signal_time") {
                account.GetOrder(ticket).copy_signal_time = Number.parseInt(value);
            }

            if (name == "close_signal_time") {
                account.GetOrder(ticket).close_signal_time = Number.parseInt(value);
            }

            if (name == "modify_target_signal_time") {
                account.GetOrder(ticket).modify_target_signal_time = Number.parseInt(value);
            }

            if (name == "modify_stoploss_signal_time") {
                account.GetOrder(ticket).modify_stoploss_signal_time = Number.parseInt(value);
            }

            if (name == "copy_execution_time") {
                account.GetOrder(ticket).copy_execution_time = Number.parseInt(value);
            }

            if (name == "close_execution_time") {
                account.GetOrder(ticket).close_execution_time = Number.parseInt(value);
            }

            if (name == "modify_target_execution_time") {
                account.GetOrder(ticket).modify_target_execution_time = Number.parseInt(value);
            }

            if (name == "modify_stoploss_execution_time") {
                account.GetOrder(ticket).modify_stoploss_execution_time = Number.parseInt(value);
            }


            if (name == "new_target") {
                new_target = Number.parseFloat(value);
            }

            if (name == "new_stoploss") {
                new_stoploss = Number.parseFloat(value);
            }


            if (name == "stoploss_changed" && value == "true") {
                is_stoploss_changed = true;
            }

            if (name == "modify_target_success") {
                modify_target_success = value;
            }

            if (name == "modify_stoploss_success") {
                modify_stoploss_success = value;
            }

            if (name == "validate_place_order_success") {
                validate_place_order_success = value;
            }

            if (name == "place_order_success") {
                place_order_success = value;
            }

            if (name == "copy_success") {
                copy_success = value;
            }

            if (name == "close_success") {
                close_success = value;
            }

            if (name == "own_close_success") {
                own_close_success = value;
            }

            if (name == "copy_trades" && value == "true") {
                is_copy_trades = true;
            }

            if (name == "close_trades" && value == "true") {
                is_close_trades = true;
            }

            if (name == "modify_trades" && value == "true") {
                is_modify_trades = true;
            }

            if (name == "account_balance_changed" && value == "true") {
                is_account_balance_changed = true;
            }

            if (name == "spread_cost") {
                spread_cost = parseFloat(value);
            }

            if (name == "required_margin") {
                required_margin = parseFloat(value);
            }
            
            if (name == "error") {
                error = value;
                account.SetLastError(error);
            }

        }

        if (intro) {
            if (account.Broker() && account.AccountNumber()) {
                ipcSend('intro', account.Safecopy());
            } else {
                account.SendGetIntro();
            }
        }

        if (ticket > -1) {
            ipcSend('order', account.Safecopy());
        }

        var peer = this.getTraderAccount(peer_broker, peer_account_number);
        this.PairTraderAccountWith(account, peer);

        this.ComputeHedgeProfit(account);
        this.ComputeHedgeProfit(account.Peer());//do for peer also

        if (ticket == -1) {
            console.log("investigate why ticket is ", ticket);
        }


        if (origin_ticket == -1) {
            console.log("investigate why origin_ticket is ", origin_ticket);
        }

        if (fire_market_closed) {
            ipcSend('market-close', account.Safecopy());
        }

        if (fire_market_opened) {
            ipcSend('market-open', account.Safecopy());
        }

        if (is_copy_trades) {
            this.SendCopyToPeer(account);
        }

        if (is_close_trades) {
            this.SendCloseToPeer(account);
        }

        if (is_modify_trades || is_stoploss_changed) {
            this.SendModifyToPeer(account);
        }

        if (is_account_balance_changed) {
            ipcSend('account-balance-changed', account.Safecopy());
        }

        if (validate_place_order_success == "true") {
            this.OnValidatePlaceOrderResult(account, uuid, spread_cost, required_margin, true, error)
        }

        if (validate_place_order_success == "false") {
            this.OnValidatePlaceOrderResult(account, uuid, spread_cost, required_margin, false, error)
        }



        if (place_order_success == "true") {
            var result = this.OnPlaceOrderResult(account, ticket, uuid, true);
            ipcSend('sync-place-order-success', account.Safecopy());
            if (result == 2) {
                ipcSend('place-order-paired', account.Safecopy());
            }
        }

        if (place_order_success == "false") {           
            this.OnPlaceOrderResult(account, ticket, uuid, false);
            ipcSend('sync-place-order-fail', account.Safecopy());
        }

        if (copy_success == "true") {
            this.OnCopyResult(account, ticket, origin_ticket, true);
            ipcSend('sync-copy-success', account.Safecopy());
        }

        if (copy_success == "false") {
            if (ticket == -1) {//we expect ticket to be -1 since the copy failed
                ticket = this.GetPairedOwnTicketUsingPeerTicket(account, origin_ticket); //get own ticket using peer ticket
            }
            this.OnCopyResult(account, ticket, origin_ticket, false);
            ipcSend('sync-copy-fail', account.Safecopy());
        }

        if (own_close_success == "true") {
            this.OnOwnCloseResult(account, ticket, true);           
            ipcSend('own-close-success', {
                account: account.Safecopy(),
                force: force,
                reason: reason
            });
            
        }

        if (own_close_success == "false") {
            this.OnOwnCloseResult(account, ticket, false);
            ipcSend('own-close-fail', {
                account: account.Safecopy(),
                force: force,
                ticket: ticket
            });
        }


        if (close_success == "true") {
            this.OnCloseResult(account, ticket, origin_ticket, true);
            ipcSend('sync-close-success', account.Safecopy());            
        }

        if (close_success == "false") {
            this.OnCloseResult(account, ticket, origin_ticket, false);
            ipcSend('sync-close-fail', account.Safecopy());
        }


        if (modify_target_success == "true") {
            this.OnModifyTargetResult(account, ticket, origin_ticket, new_target, true, error);
            ipcSend('modify-target-success', account.Safecopy());
        }

        if (modify_target_success == "false") {
            this.OnModifyTargetResult(account, ticket, origin_ticket, new_target, false, error);
            ipcSend('modify-target-fail', account.Safecopy());
        }

        if (modify_stoploss_success == "true") {
            this.OnModifyStoplossResult(account, ticket, origin_ticket, new_stoploss, true, error);
            ipcSend('modify-stoploss-success', account.Safecopy());
        }

        if (modify_stoploss_success == "false") {
            this.OnModifyStoplossResult(account, ticket, origin_ticket, new_stoploss, false, error);
            ipcSend('modify-stoploss-fail', account.Safecopy());
        }

    }

    private CheckPossibleLossPrevention(account: TraderAccount) {

        var before_swap_time = SyncUtil.AppConfigMap.get('automatically_avoid_loss_due_to_next_day_swap_by_closing_trades_before_swap_time'); // in milliseconds already
        
        if (!before_swap_time || before_swap_time <= 0) {
            return;//not set - so leave
        }

        if (account.HedgeProfitTomorrow() > 0) {
            return;
        }


        if (account.Peer() && account.Peer().HedgeProfitTomorrow() > 0) {
            return;
        }

        var GMT = 2; //We are using GMT+2 

        var swap_time = new Date().setUTCHours(24 + GMT); //the time swap is charged tomorrow

        var diff_time = swap_time - Date.now();

        if (diff_time > before_swap_time) {
            return;
        }
        

        //at this point the trades must be closed to avoid loss

        account.CloseAllTrades('closing-all-trades', 'Closing all tradings to avoid hedge loss due to swap increase.');//close both own trades and peer trades

    }

}