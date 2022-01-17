"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
var main_1 = require("./main");
var app_1 = require("./app");
var SyncUtil_1 = require("./SyncUtil");
var Config_1 = require("./Config");
var Constants_1 = require("./Constants");
var OrderPlacement_1 = require("./OrderPlacement");
var Emailer_1 = require("./Emailer");
var SyncService = /** @class */ (function () {
    function SyncService() {
        this.pairedAccounts = new Array();
        this.unpairedAccounts = new Array();
        this.PING_INTERVAL = 1000;
        this.LastRoutineSyncChecksInterval = 0;
        this.LastRoutineRefreshAccountInfoInterval = 0;
        this.PlaceOrdersTriggerList = new Array();
        //ROUTINE SYNC CHECKS INTERVAL
        this.RoutineSyncChecksInterval = function () {
            var default_val = 10;
            var val = SyncUtil_1.SyncUtil.AppConfigMap.get("sync_check_interval_in_seconds") - 0 ||
                default_val;
            return (val <= 0 ? default_val : val) * 1000;
        };
        this.RoutineRefreshAccountInfoInterval = function () {
            var default_val = 10;
            var val = SyncUtil_1.SyncUtil.AppConfigMap.get("refresh_account_info_interval_in_seconds") -
                0 || default_val;
            return (val <= 0 ? default_val : val) * 1000;
        };
        //collection of all successfully synchronized trades - this will be loaded from the
        //database. after every successful synchronizatio this collection must be updated
        //and saved to the database. This is the collections that will be used to check if
        //the paired trades are actually synchronized.
        //the Keys of the dictinary is the PairIDs while the Values are the paired order tickets
        //of the respective trades successfully synchronized (copied)
        this.syncOpenTickectPairs = new Map();
        this.syncClosedTickectPairs = new Map();
        this.pendingAccountPlacementOrderMap = new Map();
        this.emailer = new Emailer_1.Emailer();
    }
    SyncService.prototype.Start = function () {
        try {
            SyncUtil_1.SyncUtil.LoadAappConfig();
            //first load the sync state of the trades
            var file = Config_1.Config.SYNC_LOG_FILE;
            var dirname = app_1.path.dirname(file);
            if (!app_1.fs.existsSync(dirname)) {
                app_1.mkdirp.sync(dirname);
            }
            var fd = null;
            if (app_1.fs.existsSync(file)) {
                //file exists
                //according to doc - Open file for reading and writing.
                //An exception occurs if the file does not exist
                //So since we know that at this point the file exists we are not bothered about exception
                //since it will definitely not be thrown
                fd = app_1.fs.openSync(file, "r+");
            }
            else {
                //file does not exist
                //according to doc - Open file for reading and writing.
                //The file is created(if it does not exist) or truncated(if it exists).
                //So since we known that at this point it does not we are not bothered about the truncation
                fd = app_1.fs.openSync(file, "w+");
            }
            var stats = app_1.fs.statSync(file);
            var size = stats["size"];
            var rq_size = size;
            var readPos = size > rq_size ? size - rq_size : 0;
            var length = size - readPos;
            var buffer = Buffer.alloc(length);
            if (length > 0) {
                app_1.fs.readSync(fd, buffer, 0, length, readPos);
                var data = buffer.toString(); //toString(0, length) did not work but toString() worked for me
                this.syncOpenTickectPairs = new Map(JSON.parse(data));
            }
        }
        catch (e) {
            console.log(e);
            throw e;
        }
        //set timer for ping
        setInterval(this.OnTimedPingEvent.bind(this), this.PING_INTERVAL);
        this.CheckRoutineSyncChecksInterval();
        this.CheckRoutineRefreshAccountInfoInterval();
        //run the service handler
        setImmediate(this.Handler.bind(this));
    };
    SyncService.prototype.CheckPlaceOrderTriggerPermission = function (trigger) {
        //Ensure no open position otherwise reject this add operation.
        //Since the strategy is mainly maintaining one open trade per account
        if (!trigger.buy_trader.Peer()) {
            main_1.ipcSend("place-order-trigger-rejected", "Peer for [" + (trigger.buy_trader.Broker(), trigger.buy_trader.AccountNumber()) + "] is null");
            return;
        }
        if (trigger.buy_trader.OpenOrdersCount() > 0) {
            main_1.ipcSend("place-order-trigger-rejected", "Placing order trigger is not allowed if there is any open position - [" + (trigger.buy_trader.Broker(), trigger.buy_trader.AccountNumber()) + "] has at least one open position");
            return false;
        }
        if (trigger.buy_trader.Peer().OpenOrdersCount() > 0) {
            main_1.ipcSend("place-order-trigger-rejected", "Placing order trigger is not allowed if there is any open position - [" + (trigger.buy_trader.Peer().Broker(),
                trigger.buy_trader.Peer().AccountNumber()) + "] has at least one open position");
            return false;
        }
        return true;
    };
    SyncService.prototype.AddPlaceOrderTrigger = function (trigger) {
        if (!this.CheckPlaceOrderTriggerPermission(trigger)) {
            return;
        }
        this.PlaceOrdersTriggerList.push(trigger);
        main_1.ipcSend("place-order-triggers", this.PlaceOrderTriggersSafecopies());
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
    };
    SyncService.prototype.CancelPlaceOrderTrigger = function (uuid) {
        var found = false;
        for (var i = 0; i < this.PlaceOrdersTriggerList.length; i++) {
            var trigger = this.PlaceOrdersTriggerList[i];
            if (trigger.uuid == uuid) {
                found = true;
                if (!trigger.is_triggered) {
                    this.PlaceOrdersTriggerList.splice(i, 1);
                    main_1.ipcSend("cancel-place-order-trigger-success", this.PlaceOrderTriggersSafecopies());
                }
                else {
                    main_1.ipcSend("cancel-place-order-trigger-fail", "Cannot cancel place order trigger already triggered.");
                }
            }
        }
        if (!found) {
            main_1.ipcSend("place-order-trigger-not-found", "Place order trigger not found.");
        }
    };
    SyncService.prototype.PlaceOrderTriggersSafecopies = function () {
        var arr = [];
        this.PlaceOrdersTriggerList.forEach(function (trigger) {
            arr.push(trigger.Safecopy());
        });
        return arr;
    };
    SyncService.prototype.SyncPlaceOrders = function (traderAccountBUY, traderAccountA, traderAccountB, symbol, lot_size_a, lot_size_b, trade_split_count, max_percent_diff_in_account_balances, is_triggered) {
        var _this = this;
        if (max_percent_diff_in_account_balances === void 0) { max_percent_diff_in_account_balances = Infinity; }
        if (is_triggered === void 0) { is_triggered = false; }
        if (!traderAccountBUY.Peer()) {
            return;
        }
        var position_a = traderAccountBUY.Broker() == traderAccountA.Broker() &&
            traderAccountBUY.AccountNumber() == traderAccountA.AccountNumber()
            ? Constants_1.Constants.BUY
            : Constants_1.Constants.SELL;
        var position_b = traderAccountBUY.Broker() == traderAccountB.Broker() &&
            traderAccountBUY.AccountNumber() == traderAccountB.AccountNumber()
            ? Constants_1.Constants.BUY
            : Constants_1.Constants.SELL;
        var max_percent = max_percent_diff_in_account_balances;
        if (!traderAccountA.ValidatePlaceOrder(symbol, lot_size_a, max_percent, is_triggered)
            || !traderAccountB.ValidatePlaceOrder(symbol, lot_size_b, max_percent, is_triggered)) {
            return;
        }
        var paired_uuid_arr = new Array();
        var trade_split_group_id_a = SyncUtil_1.SyncUtil.Unique();
        var trade_split_group_id_b = SyncUtil_1.SyncUtil.Unique();
        for (var i = 0; i < trade_split_count; i++) {
            var paired_uuid = SyncUtil_1.SyncUtil.Unique();
            var placementA = null;
            var placementB = null;
            placementA = new OrderPlacement_1.OrderPlacement(paired_uuid, symbol, position_a, lot_size_a, trade_split_group_id_a, trade_split_count, is_triggered);
            placementB = new OrderPlacement_1.OrderPlacement(paired_uuid, symbol, position_b, lot_size_b, trade_split_group_id_b, trade_split_count, is_triggered);
            traderAccountA.SyncPlacingOrders.set(paired_uuid, placementA);
            traderAccountB.SyncPlacingOrders.set(paired_uuid, placementB);
            paired_uuid_arr.push(paired_uuid);
            var aop1 = [traderAccountA, placementA];
            var aop2 = [traderAccountB, placementB];
            this.pendingAccountPlacementOrderMap.set(paired_uuid, [aop1, aop2]);
        }
        var afterCompleteValidation = function () {
            //clear off triggers for place order - the strategy does not permit allowing these triggers when any trade is open
            _this.ClearPlaceOrderTriggers("Placing order has cleared off all pending triggers.");
            for (var i = 0; i < paired_uuid_arr.length; i++) {
                _this.handlePendingAccountOrderPlacement(paired_uuid_arr[i], true);
            }
        };
        // check enough money
        var a_success = false;
        var b_success = false;
        var a_prop = {
            symbol: SyncUtil_1.SyncUtil.GetRelativeSymbol(symbol, traderAccountA.Broker(), traderAccountA.AccountNumber()),
            position: position_a,
            lot_size: lot_size_a * trade_split_count // total lot size for the group          
        };
        var b_prop = {
            symbol: SyncUtil_1.SyncUtil.GetRelativeSymbol(symbol, traderAccountB.Broker(), traderAccountB.AccountNumber()),
            position: position_b,
            lot_size: lot_size_b * trade_split_count // total lot size for the group          
        };
        var command = 'check_enough_money';
        var err_prefix = is_triggered ? "Trigger validation error!\n" : "";
        traderAccountA.sendEACommand(command, a_prop, function (response) {
            a_success = response.success;
            if (a_success && b_success) { //there is enough money so send
                afterCompleteValidation();
            }
            else if (!a_success) {
                traderAccountA.SetLastError("" + err_prefix + response.message);
                main_1.ipcSend("validate-place-order-fail", traderAccountA.Safecopy());
            }
        });
        traderAccountB.sendEACommand(command, b_prop, function (response) {
            b_success = response.success;
            if (a_success && b_success) { //there is enough money so send
                afterCompleteValidation();
            }
            else if (!b_success) {
                traderAccountB.SetLastError("" + err_prefix + response.message);
                main_1.ipcSend("validate-place-order-fail", traderAccountB.Safecopy());
            }
        });
    };
    SyncService.prototype.GetEmailer = function () {
        return this.emailer;
    };
    SyncService.prototype.AddClient = function (traderAccount) {
        this.unpairedAccounts.push(traderAccount);
    };
    SyncService.prototype.OnTimedPingEvent = function () {
        this.eachAccount(function (acct) {
            acct.Ping();
        });
    };
    SyncService.prototype.IsAlive = function (traderAccount) {
        if (traderAccount.IsConnected())
            return true;
        //at this piont the connection is closed
        this.RemovePairing(traderAccount, true); //force remove pairing
        //dispose since we have unpaired it
        for (var _i = 0, _a = this.unpairedAccounts; _i < _a.length; _i++) {
            var unpaired = _a[_i];
            if (unpaired.Broker() === traderAccount.Broker() &&
                unpaired.AccountNumber() === traderAccount.AccountNumber()) {
                SyncUtil_1.SyncUtil.ArrayRemove(this.unpairedAccounts, traderAccount); //remove from unpaired list
                traderAccount.Dispose();
                traderAccount = null;
                break;
            }
        }
        return false;
    };
    SyncService.prototype.RemovePairing = function (traderAccount, force_remove) {
        if (force_remove === void 0) { force_remove = false; }
        if (!force_remove && traderAccount.IsSyncingInProgress()) {
            main_1.ipcSend("could-not-remove-pairing", {
                account: traderAccount.Safecopy(),
                feedback: "Could not remove pairing of " + traderAccount.Broker() + ", " + traderAccount.AccountNumber() + ".\n" +
                    "Action denied because order syncing was detected!\n" +
                    "It is unsafe to remove pairing when syncing is in progress except if it arised from account disconnection.",
            });
            return;
        }
        for (var _i = 0, _a = this.pairedAccounts; _i < _a.length; _i++) {
            var pair = _a[_i];
            //consider first element of the pair
            if (pair[0] === traderAccount || pair[1] === traderAccount) {
                SyncUtil_1.SyncUtil.ArrayRemove(this.pairedAccounts, pair);
                this.unpairedAccounts.push(pair[0]); //return back to unpaired list
                this.unpairedAccounts.push(pair[1]); //return back to unpaired list
                pair[0].ResetOrdersSyncing(); //reset all orders syncing to false
                pair[1].ResetOrdersSyncing(); //reset all orders syncing to false
                pair[0].RemovePeer();
                pair[1].RemovePeer();
                main_1.ipcSend("unpaired", [pair[0].Safecopy(), pair[1].Safecopy()]);
                break;
            }
        }
    };
    SyncService.prototype.eachAccount = function (callback) {
        try {
            for (var _i = 0, _a = this.unpairedAccounts; _i < _a.length; _i++) {
                var unpaired = _a[_i];
                if (this.IsAlive(unpaired)) {
                    callback(unpaired);
                }
            }
            for (var _b = 0, _c = this.pairedAccounts; _b < _c.length; _b++) {
                var pair = _c[_b];
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
    };
    SyncService.prototype.eachPairedAccount = function (callback) {
        try {
            for (var _i = 0, _a = this.pairedAccounts; _i < _a.length; _i++) {
                var pair = _a[_i];
                this.IsAlive(pair[0]);
                this.IsAlive(pair[1]);
                callback(pair[0]);
                callback(pair[1]);
            }
        }
        catch (ex) {
            console.log(ex);
        }
    };
    SyncService.prototype.CheckRoutineSyncChecksInterval = function () {
        //set timer for routine validation checks
        var secs = this.RoutineSyncChecksInterval();
        if (this.LastRoutineSyncChecksInterval != secs) {
            clearTimeout(this.RoutineSyncChecksIntervalID);
            this.RoutineSyncChecksIntervalID = setInterval(this.RevalidateSyncAll.bind(this), secs);
            this.LastRoutineSyncChecksInterval = secs;
        }
    };
    SyncService.prototype.CheckRoutineRefreshAccountInfoInterval = function () {
        //set timer for refreshing account info on the gui
        var secs = this.RoutineRefreshAccountInfoInterval();
        if (this.LastRoutineRefreshAccountInfoInterval != secs) {
            clearTimeout(this.RoutineRefreshAccountInfoIntervalID);
            this.RoutineRefreshAccountInfoIntervalID = setInterval(this.RefreshAccountInfo.bind(this), secs);
            this.LastRoutineRefreshAccountInfoInterval = secs;
        }
    };
    SyncService.prototype.HandlePlaceOrderTriggers = function () {
        var any_triggered = false;
        for (var _i = 0, _a = this.PlaceOrdersTriggerList; _i < _a.length; _i++) {
            var trigger = _a[_i];
            if (!trigger.VerifyPair()) {
                continue;
            }
            if (!trigger.IsAccountBalanceDifferenceAllowed()) {
                continue;
            }
            if (trigger.type ==
                Constants_1.Constants.Instant_when_both_accounts_have_credit_bonuses ||
                trigger.type ==
                    Constants_1.Constants.Pending_at_price_when_both_accounts_have_credit_bonuses) {
                if (!trigger.IsBothAccountsHaveCredits()) {
                    continue;
                }
            }
            if (trigger.type == Constants_1.Constants.Pending_at_price ||
                trigger.type ==
                    Constants_1.Constants.Pending_at_price_when_both_accounts_have_credit_bonuses) {
                if (!trigger.IsPriceTrigger()) {
                    continue;
                }
            }
            //finally at this point there is a trigger
            any_triggered = true;
            this.PlaceOrderByTriger(trigger);
            break;
        }
        if (any_triggered) {
            //clear all triggers if any is triggered
            this.ClearPlaceOrderTriggers("All other triggers cleared off.");
        }
    };
    SyncService.prototype.ClearPlaceOrderTriggers = function (message) {
        if (message === void 0) { message = ""; }
        if (this.PlaceOrdersTriggerList.length > 0) {
            this.PlaceOrdersTriggerList = new Array(); // initialize
            main_1.ipcSend("place-order-triggers-clear", message);
        }
    };
    SyncService.prototype.PlaceOrderByTriger = function (trigger) {
        if (!this.CheckPlaceOrderTriggerPermission(trigger)) {
            return;
        }
        trigger.is_triggered = true;
        this.SyncPlaceOrders(trigger.buy_trader, trigger.buy_trader, trigger.buy_trader.Peer(), //sell trader
        trigger.symbol, trigger.buy_lot_size, trigger.sell_lot_size, trigger.trade_split_count, trigger.max_percent_diff_in_account_balances, true);
    };
    SyncService.prototype.Handler = function () {
        var _this = this;
        this.CheckRoutineSyncChecksInterval();
        this.CheckRoutineRefreshAccountInfoInterval();
        this.eachAccount(function (acct) {
            if (acct.HasReceived()) {
                _this.HandleRead(acct, acct.ReceiveData());
            }
            try {
                _this.emailer.Handler(acct);
                _this.CheckPossibleLossPrevention(acct);
            }
            catch (ex) {
                console.log(ex);
            }
        });
        this.HandlePlaceOrderTriggers();
        setImmediate(this.Handler.bind(this));
    };
    SyncService.prototype.SendCopyToPeer = function (traderAccount) {
        traderAccount.SendCopy(this.GetUnSyncedOrders(traderAccount));
    };
    SyncService.prototype.SendCloseToPeer = function (traderAccount) {
        traderAccount.SendClose(this.GetSyncedOrders(traderAccount));
    };
    SyncService.prototype.SendModifyToPeer = function (traderAccount) {
        traderAccount.SendModify(this.GetSyncedOrders(traderAccount));
    };
    SyncService.prototype.PairTraderAccountWith = function (traderAccount, peerAccount, is_gui) {
        if (is_gui === void 0) { is_gui = false; }
        if (traderAccount == null || peerAccount == null) {
            if (is_gui) {
                main_1.ipcSend("paired-fail", "one or two of the account to pair with is null.");
            }
            return;
        }
        if (!traderAccount.IsKnown() || !peerAccount.IsKnown()) {
            if (is_gui) {
                main_1.ipcSend("paired-fail", "one or two of the account to pair with is unknown - possibly no broker name or account number");
            }
            return;
        }
        if (traderAccount.Version() != peerAccount.Version()) {
            if (is_gui) {
                main_1.ipcSend("paired-fail", "EA version of [" + traderAccount.Broker() + ", " + traderAccount.AccountNumber() + "] (" + traderAccount.Version() + ") mismatch with that of [" + peerAccount.Broker() + ", " + peerAccount.AccountNumber() + "] (" + peerAccount.Version() + ")  - version must be the same");
            }
            return;
        }
        if (traderAccount.IsLiveAccount() === null) {
            if (is_gui) {
                main_1.ipcSend("paired-fail", "account type of [" + traderAccount.Broker() + ", " + traderAccount.AccountNumber() + "] is unknown  - must be live or demo");
            }
            return;
        }
        if (peerAccount.IsLiveAccount() === null) {
            if (is_gui) {
                main_1.ipcSend("paired-fail", "account type of [" + peerAccount.Broker() + ", " + peerAccount.AccountNumber() + "] is unknown  - must be live or demo");
            }
            return;
        }
        if (traderAccount.IsLiveAccount() !== peerAccount.IsLiveAccount()) {
            if (is_gui) {
                main_1.ipcSend("paired-fail", "cannot pair up two accounts of different types - they both must be live or demo");
            }
            return;
        }
        if (this.IsPaired(traderAccount)) {
            if (is_gui) {
                main_1.ipcSend("already-paired", "[" + traderAccount.Broker() + ", " + traderAccount.AccountNumber() + "] " +
                    ("is already paired with [" + traderAccount
                        .Peer()
                        .Broker() + ", " + traderAccount.Peer().AccountNumber() + "]!"));
            }
            return;
        }
        if (this.IsPaired(peerAccount)) {
            if (is_gui) {
                main_1.ipcSend("already-paired", "[" + peerAccount.Broker() + ", " + peerAccount.AccountNumber() + "] " +
                    ("is already paired with [" + peerAccount
                        .Peer()
                        .Broker() + ", " + peerAccount.Peer().AccountNumber() + "]!"));
            }
            return;
        }
        if (SyncUtil_1.SyncUtil.AppConfigMap.get("only_pair_live_accounts_with_same_account_name") === true) {
            if (traderAccount.IsLiveAccount() &&
                peerAccount.IsLiveAccount() &&
                traderAccount.AccountName().toLowerCase() !=
                    peerAccount.AccountName().toLowerCase()) {
                if (is_gui) {
                    main_1.ipcSend("paired-fail", "Your app configuration settings does not permit pairing two live accounts with different account name:" +
                        ("\n\nBroker: " + traderAccount.Broker() + "\nAccount Number: " + traderAccount.AccountNumber() + "\nAccount Name: " + traderAccount.AccountName()) +
                        ("\n---------------\nBroker: " + peerAccount.Broker() + "\nAccount Number: " + peerAccount.AccountNumber() + "\nAccount Name: " + peerAccount.AccountName()) +
                        "\n\nHint: You can deselect the option in your app settings to remove this restriction.");
                }
                return;
            }
        }
        for (var _i = 0, _a = this.unpairedAccounts; _i < _a.length; _i++) {
            var otherAccount = _a[_i];
            if (otherAccount != peerAccount) {
                continue;
            }
            //pair up the trader account
            traderAccount.SetPeer(otherAccount);
            otherAccount.SetPeer(traderAccount);
            var paired = [null, null];
            //assign to the appropriate column index
            paired[otherAccount.PairColumnIndex()] = otherAccount;
            paired[traderAccount.PairColumnIndex()] = traderAccount;
            this.pairedAccounts.push(paired);
            //remove from the unpaired list
            SyncUtil_1.SyncUtil.ArrayRemove(this.unpairedAccounts, otherAccount);
            SyncUtil_1.SyncUtil.ArrayRemove(this.unpairedAccounts, traderAccount);
            //now copy each other trades if neccessary
            this.SendCopyToPeer(traderAccount);
            this.SendCopyToPeer(otherAccount);
            traderAccount.EnsureTicketPeer(this.syncOpenTickectPairs);
            main_1.ipcSend("paired", traderAccount.Safecopy());
            break;
        }
    };
    SyncService.prototype.handleDuplicateEA = function (traderAccount) {
        //TODO
        console.log("TODO Duplicate EA detected!");
    };
    SyncService.prototype.getTraderAccount = function (broker, account_number) {
        for (var _i = 0, _a = this.unpairedAccounts; _i < _a.length; _i++) {
            var unpaired = _a[_i];
            if (unpaired.Broker() === broker &&
                unpaired.AccountNumber() === account_number) {
                return unpaired;
            }
        }
        for (var _b = 0, _c = this.pairedAccounts; _b < _c.length; _b++) {
            var pair = _c[_b];
            //check the first
            if (pair[0].Broker() === broker &&
                pair[0].AccountNumber() === account_number) {
                return pair[0];
            }
            //checkt the second
            if (pair[1].Broker() === broker &&
                pair[1].AccountNumber() === account_number) {
                return pair[1];
            }
        }
        return null;
    };
    SyncService.prototype.getPeer = function (traderAccount) {
        for (var _i = 0, _a = this.pairedAccounts; _i < _a.length; _i++) {
            var pair = _a[_i];
            //check the first
            if (pair[0].Broker() === traderAccount.Broker() &&
                pair[0].AccountNumber() === traderAccount.AccountNumber() &&
                (pair[1].Broker() !== traderAccount.Broker() ||
                    pair[1].AccountNumber() !== traderAccount.AccountNumber())) {
                return pair[1];
            }
            //chect the second
            if (pair[1].Broker() === traderAccount.Broker() &&
                pair[1].AccountNumber() === traderAccount.AccountNumber() &&
                (pair[0].Broker() !== traderAccount.Broker() ||
                    pair[0].AccountNumber() !== traderAccount.AccountNumber())) {
                return pair[0];
            }
        }
        return null;
    };
    SyncService.prototype.IsPaired = function (traderAccount) {
        return this.getPeer(traderAccount) != null;
    };
    SyncService.prototype.OnModifyTargetResult = function (traderAccount, ticket, origin_ticket, new_target, success, error) {
        if (traderAccount == null)
            return;
        var peerAccount = this.getPeer(traderAccount);
        if (peerAccount == null)
            return;
        var origin_order = peerAccount.GetOrder(origin_ticket);
        if (origin_order) {
            origin_order.SyncModifyingTarget(false);
        }
        if (!success &&
            error != Constants_1.Constants.trade_condition_not_changed &&
            error != Constants_1.Constants.no_changes) {
            var peer = traderAccount.Peer();
            if (peer) {
                peer.RetrySendModifyTarget(origin_ticket, ticket, new_target);
            }
            return;
        }
    };
    SyncService.prototype.OnModifyStoplossResult = function (traderAccount, ticket, origin_ticket, new_stoploss, success, error) {
        if (traderAccount == null)
            return;
        var peerAccount = this.getPeer(traderAccount);
        if (peerAccount == null)
            return;
        var origin_order = peerAccount.GetOrder(origin_ticket);
        if (origin_order) {
            origin_order.SyncModifyingStoploss(false);
        }
        if (!success &&
            error != Constants_1.Constants.trade_condition_not_changed &&
            error != Constants_1.Constants.no_changes) {
            var peer = traderAccount.Peer();
            if (peer) {
                peer.RetrySendModifyStoploss(origin_ticket, ticket, new_stoploss);
            }
            return;
        }
    };
    SyncService.prototype.DoOrderPair = function (traderAccount, peerAccount, ticket, peer_ticket) {
        var pairId = traderAccount.PairID();
        var open_tickect_pairs = new Array();
        if (this.syncOpenTickectPairs.get(pairId)) {
            open_tickect_pairs = this.syncOpenTickectPairs.get(pairId);
        }
        else {
            open_tickect_pairs = new Array();
        }
        var paired_tickets = [null, null];
        //assign to the appropriate column index
        paired_tickets[traderAccount.PairColumnIndex()] = ticket;
        paired_tickets[peerAccount.PairColumnIndex()] = peer_ticket;
        open_tickect_pairs.push(paired_tickets);
        this.syncOpenTickectPairs.set(pairId, open_tickect_pairs);
        traderAccount.EnsureTicketPeer(this.syncOpenTickectPairs);
        this.SaveSyncState();
    };
    SyncService.prototype.handlePendingAccountOrderPlacement = function (uuid, send) {
        var accPl = this.pendingAccountPlacementOrderMap.get(uuid);
        if (!accPl) {
            return;
        }
        if (send) {
            var traderAccount = accPl[0][0];
            var placement = accPl[0][1];
            var peerAccount = accPl[1][0];
            var peer_placement = accPl[1][1];
            //now send
            traderAccount.PlaceOrder(placement); //old
            peerAccount.PlaceOrder(peer_placement); //old
        }
        this.pendingAccountPlacementOrderMap.delete(uuid);
    };
    SyncService.prototype.OnPlaceOrderResult = function (traderAccount, ticket, uuid, success) {
        if (traderAccount == null)
            return;
        var peerAccount = this.getPeer(traderAccount);
        if (peerAccount == null)
            return;
        var placement = traderAccount.SyncPlacingOrders.get(uuid);
        var peer_placement = peerAccount.SyncPlacingOrders.get(uuid);
        if (!success) {
            if (!peerAccount.IsPlacementOrderClosed(uuid)) {
                //ensuring the peer order placement has not already closed
                var placement = traderAccount.SyncPlacingOrders.get(uuid);
                traderAccount.RetrySendPlaceOrderOrForceClosePeer(placement);
            }
            else {
                //Oops!!! the peer order placement has closed so just cancel and clear off the entries
                traderAccount.SyncPlacingOrders.delete(uuid);
                peerAccount.SyncPlacingOrders.delete(uuid);
            }
            return;
        }
        placement.SetResult(ticket);
        placement.SetOperationCompleteStatus(OrderPlacement_1.OrderPlacement.COMPLETE_SUCCESS);
        var order = traderAccount.GetOrder(ticket);
        if (order) {
            order.SetCopyable(false);
            order.SetGroupId(placement.trade_split_group_id);
            order.SetGroupOderCount(placement.trade_split_count);
        }
        //if peer did not complete with success status then focibly close this order
        if (peer_placement.OperationCompleteStatus() == OrderPlacement_1.OrderPlacement.COMPLETE_FAIL) {
            var ticket = placement.ticket;
            var reason = traderAccount.ForceCloseReasonForFailedOrderPlacement(ticket);
            traderAccount.ForceCloseMe(ticket, reason); //forcibly close this order
            return 1;
        }
        if (placement.state != Constants_1.Constants.SUCCESS ||
            peer_placement.state != Constants_1.Constants.SUCCESS) {
            return 1; //one done
        }
        this.DoOrderPair(traderAccount, peerAccount, placement.ticket, peer_placement.ticket);
        //clear off the placement orders entries
        traderAccount.SyncPlacingOrders.delete(uuid);
        peerAccount.SyncPlacingOrders.delete(uuid);
        return 2; //both done
    };
    SyncService.prototype.OnCopyResult = function (traderAccount, ticket, origin_ticket, success) {
        if (traderAccount == null)
            return;
        var peerAccount = this.getPeer(traderAccount);
        if (peerAccount == null)
            return;
        var origin_order = peerAccount.GetOrder(origin_ticket);
        if (origin_order) {
            origin_order.SyncCopying(false);
        }
        if (!success) {
            var peer = traderAccount.Peer();
            if (peer) {
                peer.RetrySendCopyOrForceCloseMe(origin_ticket);
            }
            return;
        }
        this.DoOrderPair(traderAccount, peerAccount, ticket, origin_ticket);
    };
    SyncService.prototype.OnCloseResult = function (traderAccount, ticket, origin_ticket, success) {
        if (traderAccount == null)
            return;
        var peerAccount = this.getPeer(traderAccount);
        if (peerAccount == null)
            return;
        var origin_order = peerAccount.GetOrder(origin_ticket);
        if (origin_order) {
            origin_order.Closing(false);
        }
        if (!success) {
            var peer = traderAccount.Peer();
            if (peer) {
                peer.RetrySendClose(origin_ticket, ticket);
            }
            return;
        }
        this.FinalizeCloseSuccess(traderAccount, ticket);
    };
    SyncService.prototype.OnOwnCloseResult = function (traderAccount, ticket, success) {
        if (traderAccount == null)
            return;
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
        if (peerAccount == null)
            return;
        var peer_order = peerAccount.GetOrder(order.peer_ticket);
        if (order.IsClosed() && peer_order && peer_order.IsClosed()) {
            this.FinalizeCloseSuccess(traderAccount, ticket);
        }
    };
    SyncService.prototype.FinalizeCloseSuccess = function (traderAccount, ticket) {
        var pairId = traderAccount.PairID();
        var open_tickect_pairs = new Array();
        if (this.syncOpenTickectPairs.get(pairId)) {
            open_tickect_pairs = this.syncOpenTickectPairs.get(pairId);
        }
        else {
            open_tickect_pairs = new Array();
        }
        //Remove the paired order ticket from the list
        for (var _i = 0, open_tickect_pairs_1 = open_tickect_pairs; _i < open_tickect_pairs_1.length; _i++) {
            var ticket_pair = open_tickect_pairs_1[_i];
            var own_ticket = ticket_pair[traderAccount.PairColumnIndex()];
            if (own_ticket === ticket) {
                SyncUtil_1.SyncUtil.ArrayRemove(open_tickect_pairs, ticket_pair);
                //transfer to closed ticket pairs
                var closed_ticket_pairs = this.syncClosedTickectPairs.get(pairId);
                if (!closed_ticket_pairs) {
                    closed_ticket_pairs = new Array();
                }
                closed_ticket_pairs.push(ticket_pair);
                this.syncClosedTickectPairs.set(pairId, closed_ticket_pairs);
                break;
            }
        }
        this.syncOpenTickectPairs.set(pairId, open_tickect_pairs);
        this.SaveSyncState();
    };
    /**
     * These are orders that have not been paired with its peer
     */
    SyncService.prototype.GetUnSyncedOrders = function (traderAccount) {
        var unsync_orders = new Array();
        var peerAccount = this.getPeer(traderAccount);
        if (peerAccount == null)
            return []; //yes empty since it is not even paired to any account
        var orders = traderAccount.Orders();
        var pairId = traderAccount.PairID();
        var open_tickect_pairs = this.syncOpenTickectPairs.get(pairId);
        var closed_tickect_pairs = this.syncClosedTickectPairs.get(pairId);
        if (!open_tickect_pairs)
            return orders; //meaning no order has been synced so return all
        if (!closed_tickect_pairs) {
            closed_tickect_pairs = new Array();
        }
        //at this point they are paired so get the actuall unsynced orders
        for (var _i = 0, orders_1 = orders; _i < orders_1.length; _i++) {
            var order = orders_1[_i];
            var order_ticket = order.ticket;
            var found = false;
            //check in open paired tickets
            for (var _a = 0, open_tickect_pairs_2 = open_tickect_pairs; _a < open_tickect_pairs_2.length; _a++) {
                var ticket_pair = open_tickect_pairs_2[_a];
                var own_ticket = ticket_pair[traderAccount.PairColumnIndex()];
                if (own_ticket === order_ticket) {
                    found = true;
                    break;
                }
            }
            //also check in closed paired tickets
            for (var _b = 0, closed_tickect_pairs_1 = closed_tickect_pairs; _b < closed_tickect_pairs_1.length; _b++) {
                var ticket_pair = closed_tickect_pairs_1[_b];
                var own_ticket = ticket_pair[traderAccount.PairColumnIndex()];
                if (own_ticket === order_ticket) {
                    found = true;
                    console.log("found int closed tickets " + order_ticket);
                    break;
                }
            }
            if (!found) {
                unsync_orders.push(order);
            }
        }
        return unsync_orders;
    };
    /**
     * These are orders that have been paired with its peer
     */
    SyncService.prototype.GetSyncedOrders = function (traderAccount) {
        var synced_orders = new Array();
        var peerAccount = this.getPeer(traderAccount);
        if (peerAccount == null)
            return synced_orders;
        var pairId = traderAccount.PairID();
        if (!this.syncOpenTickectPairs.get(pairId))
            return synced_orders;
        var syncTickects = this.syncOpenTickectPairs.get(pairId);
        var order_pairs_not_found = new Array();
        var row = -1;
        for (var _i = 0, syncTickects_1 = syncTickects; _i < syncTickects_1.length; _i++) {
            var ticket_pair = syncTickects_1[_i];
            row++;
            var own_column = traderAccount.PairColumnIndex();
            var peer_column = peerAccount.PairColumnIndex();
            var own_ticket = ticket_pair[own_column];
            var peer_ticket = ticket_pair[peer_column];
            var own_order = traderAccount.GetOrder(own_ticket);
            var peer_order = peerAccount.GetOrder(peer_ticket);
            if (!own_order || !peer_order) {
                //for case where the order does not exist
                order_pairs_not_found.push(ticket_pair);
                continue;
            }
            var paired = [null, null];
            paired[own_column] = own_order;
            paired[peer_column] = peer_order;
            synced_orders.push(paired);
        }
        //purge out orders not found
        for (var _a = 0, order_pairs_not_found_1 = order_pairs_not_found; _a < order_pairs_not_found_1.length; _a++) {
            var ticket_pair = order_pairs_not_found_1[_a];
            SyncUtil_1.SyncUtil.ArrayRemove(this.syncOpenTickectPairs.get(pairId), ticket_pair);
        }
        return synced_orders;
    };
    SyncService.prototype.GetPairedOwnTicketUsingPeerTicket = function (traderAccount, peer_ticket) {
        var synced_orders = new Array();
        var peerAccount = this.getPeer(traderAccount);
        if (peerAccount == null)
            return null;
        var pairId = traderAccount.PairID();
        if (!this.syncOpenTickectPairs.get(pairId))
            return null;
        var syncTickects = this.syncOpenTickectPairs.get(pairId);
        for (var _i = 0, syncTickects_2 = syncTickects; _i < syncTickects_2.length; _i++) {
            var pair_ticket = syncTickects_2[_i];
            var own_column = traderAccount.PairColumnIndex();
            var peer_column = peerAccount.PairColumnIndex();
            if (pair_ticket[peer_column] == peer_ticket) {
                return pair_ticket[own_column];
            }
        }
        return null;
    };
    SyncService.prototype.SaveSyncState = function () {
        var data = JSON.stringify(Array.from(this.syncOpenTickectPairs.entries()));
        //overwrite the file content
        app_1.fs.writeFile(Config_1.Config.SYNC_LOG_FILE, data, { encoding: "utf8", flag: "w" }, function (err) {
            if (err) {
                return console.log(err);
            }
        });
    };
    SyncService.prototype.RefreshAccountInfo = function () {
        this.eachPairedAccount(function (account) {
            main_1.ipcSend("account-info", account.Safecopy());
        });
    };
    SyncService.prototype.RevalidateSyncAll = function () {
        var _this = this;
        console.log("Revalidating all sync begins...");
        this.eachPairedAccount(function (account) {
            if (!account.IsMarketClosed()) {
                _this.RevalidateSyncCopy(account);
                _this.RevalidateSyncClose(account);
                _this.RevalidateSyncModify(account);
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
    };
    SyncService.prototype.RevalidateSyncCopy = function (account) {
        console.log("Revalidating copy sync...");
        this.SendCopyToPeer(account);
    };
    SyncService.prototype.RevalidateSyncClose = function (account) {
        console.log("Revalidating close sync...");
        this.SendCloseToPeer(account);
    };
    SyncService.prototype.RevalidateSyncModify = function (account) {
        console.log("Revalidating modify sync...");
        this.SendModifyToPeer(account);
    };
    SyncService.prototype.HandleRead = function (account, data) {
        var _a;
        if (data == null || data.length == 0)
            return;
        if (data != "ping=pong") {
            console.log("[" + account.StrID() + "] ", data); //TESTING!!!
        }
        var intro = false;
        var is_stoploss_changed = false;
        var peer_broker = null;
        var peer_account_number = null;
        var ticket = null;
        var origin_ticket = null;
        var is_copy_trades = false;
        var is_close_trades = false;
        var is_modify_trades = false;
        var is_account_balance_changed = false;
        var place_order_success = null; // yes must be null since we care about three state: null, true or false
        var copy_success = null; // yes must be null since we care about three state: null, true or false
        var own_close_success = null; // yes must be null since we care about three state: null, true or false
        var close_success = null; // yes must be null since we care about three state: null, true or false
        var modify_target_success = null; // yes must be null since we care about three state: null, true or false
        var modify_stoploss_success = null; // yes must be null since we care about three state: null, true or false
        var error = "";
        var uuid = "";
        var force = false;
        var reason = "";
        var token = data.split(Constants_1.Constants.TAB);
        var new_target = 0;
        var new_stoploss = 0;
        var fire_market_closed = false;
        var fire_market_opened = false;
        var spread_cost = 0;
        var required_margin = 0;
        var symbol = "";
        var raw_symbol = "";
        var command_id = "";
        var command = ""; // name of the command
        var command_response = "";
        var command_success = false;
        for (var i = 0; i < token.length; i++) {
            var split = token[i].split("=");
            var name = split[0];
            var value = split[1];
            if (name == "command") {
                command = value;
            }
            if (name == "command_id") {
                command_id = value;
            }
            if (name == "command_response") {
                command_response = value;
            }
            if (name == "command_success") {
                command_success = value === "true";
                (_a = account.EACommandList.get(command_id)) === null || _a === void 0 ? void 0 : _a.callback({
                    message: command_response,
                    success: command_success
                });
                account.EACommandList.delete(command_id);
            }
            if (name == "is_market_closed") {
                if (value == "true") {
                    //check if the previous state was open
                    if (!account.IsMarketClosed()) {
                        fire_market_closed = true;
                    }
                    account.SetMarketClosed(true);
                }
                else {
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
                var normalize_broker = SyncUtil_1.SyncUtil.NormalizeName(value);
                account.SetBroker(normalize_broker);
            }
            if (name == "terminal_path") {
                account.SetIconFile("" + value + app_1.path.sep + Config_1.Config.TERMINAL_ICON_NAME + Config_1.Config.TERMINAL_ICON_TYPE);
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
            if (name == "terminal_connected") {
                account.SetTerminalConnected(value === "true");
            }
            if (name == "only_trade_with_credit") {
                account.SetOnlyTradeWithCredit(value === "true");
            }
            if (name == "chart_symbol") {
                account.SetChartSymbol(value);
            }
            if (name == "chart_symbol_trade_allowed") {
                account.SetChartSymbolTradeAllowed(value === "true");
            }
            if (name == "chart_symbol_max_lot_size") {
                account.SetChartSymbolMaxLotSize(parseFloat(value));
            }
            if (name == "chart_symbol_min_lot_size") {
                account.SetChartSymbolMinLotSize(parseFloat(value));
            }
            if (name == "chart_symbol_tick_value") {
                account.SetChartSymbolTickValue(parseFloat(value));
            }
            if (name == "chart_symbol_swap_long") {
                account.SetChartSymbolSwapLong(parseFloat(value));
            }
            if (name == "chart_symbol_swap_short") {
                account.SetChartSymbolSwapShort(parseFloat(value));
            }
            if (name == "chart_symbol_trade_units") {
                account.SetChartSymbolTradeUnits(parseFloat(value));
            }
            if (name == "chart_symbol_spread") {
                account.SetChartSymbolSpread(parseFloat(value));
            }
            if (name == "chart_market_price") {
                account.SetChartMarketPrice(parseFloat(value));
            }
            if (name == "platform_type") {
                account.SetPlatformType(value);
            }
            if (name == "peer_broker") {
                peer_broker = SyncUtil_1.SyncUtil.NormalizeName(value);
            }
            if (name == "peer_account_number") {
                peer_account_number = value;
            }
            if (name == "trade_copy_type") {
                account.SetTradeCopyType(value);
            }
            if (name == "is_live_account" && value == "true") {
                account.SetIsLiveAccount(true);
            }
            else if (name == "is_live_account" && value == "false") {
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
                var order = account.GetOrder(ticket);
                order.force = force;
            }
            if (name == "reason") {
                reason = value;
                var order = account.GetOrder(ticket);
                order.reason = reason;
            }
            if (name == "origin_ticket") {
                origin_ticket = parseInt(value);
            }
            if (name == "symbol") {
                symbol = value; //important - used in this loop
                account.GetOrder(ticket).symbol = value;
            }
            if (name == "symbol_commission_per_lot") {
                account.SetSymbolCommissionPerLot(symbol, parseFloat(value));
                account.SetSymbolCommissionPerLot(raw_symbol, parseFloat(value));
            }
            if (name == "raw_symbol") {
                raw_symbol = value; //important - used in this loop
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
                var order = account.GetOrder(ticket);
                var was_close = order.close_time > 0;
                order.close_time = Number.parseInt(value);
                if (!was_close && order.close_time > 0) {
                    //just closed
                    account.SendCloseToGroup(ticket); // also close all orders in same group
                    this.emailer.OrderCloseNotify(account, order);
                }
            }
            if (name == "open_time") {
                var order = account.GetOrder(ticket);
                var was_open = order.open_time > 0;
                order.open_time = Number.parseInt(value);
                if (!was_open && order.open_time > 0) {
                    //just opened
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
            if (name == "account_expected_hedge_profit") {
                account.SetHedgeProfit(parseFloat(value));
            }
            if (name == "error") {
                error = value;
                account.SetLastError(error);
            }
        }
        if (intro) {
            if (account.Broker() && account.AccountNumber()) {
                main_1.ipcSend("intro", account.Safecopy());
            }
            else {
                account.SendGetIntro();
            }
        }
        if (ticket > -1) {
            main_1.ipcSend("order", account.Safecopy());
        }
        var peer = this.getTraderAccount(peer_broker, peer_account_number);
        this.PairTraderAccountWith(account, peer);
        if (ticket == -1) {
            console.log("investigate why ticket is ", ticket);
        }
        if (origin_ticket == -1) {
            console.log("investigate why origin_ticket is ", origin_ticket);
        }
        if (fire_market_closed) {
            main_1.ipcSend("market-close", account.Safecopy());
        }
        if (fire_market_opened) {
            main_1.ipcSend("market-open", account.Safecopy());
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
            main_1.ipcSend("account-balance-changed", account.Safecopy());
        }
        if (place_order_success == "true") {
            var result = this.OnPlaceOrderResult(account, ticket, uuid, true);
            main_1.ipcSend("sync-place-order-success", account.Safecopy());
            if (result == 2) {
                main_1.ipcSend("place-order-paired", account.Safecopy());
            }
        }
        if (place_order_success == "false") {
            this.OnPlaceOrderResult(account, ticket, uuid, false);
            main_1.ipcSend("sync-place-order-fail", account.Safecopy());
        }
        if (copy_success == "true") {
            this.OnCopyResult(account, ticket, origin_ticket, true);
            main_1.ipcSend("sync-copy-success", account.Safecopy());
        }
        if (copy_success == "false") {
            if (ticket == -1) {
                //we expect ticket to be -1 since the copy failed
                ticket = this.GetPairedOwnTicketUsingPeerTicket(account, origin_ticket); //get own ticket using peer ticket
            }
            this.OnCopyResult(account, ticket, origin_ticket, false);
            main_1.ipcSend("sync-copy-fail", account.Safecopy());
        }
        if (own_close_success == "true") {
            this.OnOwnCloseResult(account, ticket, true);
            main_1.ipcSend("own-close-success", {
                account: account.Safecopy(),
                force: force,
                reason: reason,
            });
        }
        if (own_close_success == "false") {
            this.OnOwnCloseResult(account, ticket, false);
            main_1.ipcSend("own-close-fail", {
                account: account.Safecopy(),
                force: force,
                ticket: ticket,
            });
        }
        if (close_success == "true") {
            this.OnCloseResult(account, ticket, origin_ticket, true);
            main_1.ipcSend("sync-close-success", account.Safecopy());
        }
        if (close_success == "false") {
            this.OnCloseResult(account, ticket, origin_ticket, false);
            main_1.ipcSend("sync-close-fail", account.Safecopy());
        }
        if (modify_target_success == "true") {
            this.OnModifyTargetResult(account, ticket, origin_ticket, new_target, true, error);
            main_1.ipcSend("modify-target-success", account.Safecopy());
        }
        if (modify_target_success == "false") {
            this.OnModifyTargetResult(account, ticket, origin_ticket, new_target, false, error);
            main_1.ipcSend("modify-target-fail", account.Safecopy());
        }
        if (modify_stoploss_success == "true") {
            this.OnModifyStoplossResult(account, ticket, origin_ticket, new_stoploss, true, error);
            main_1.ipcSend("modify-stoploss-success", account.Safecopy());
        }
        if (modify_stoploss_success == "false") {
            this.OnModifyStoplossResult(account, ticket, origin_ticket, new_stoploss, false, error);
            main_1.ipcSend("modify-stoploss-fail", account.Safecopy());
        }
    };
    SyncService.prototype.CheckPossibleLossPrevention = function (account) {
        var before_swap_time = SyncUtil_1.SyncUtil.AppConfigMap.get("automatically_avoid_loss_due_to_next_day_swap_by_closing_trades_before_swap_time"); // in milliseconds already
        if (!before_swap_time || before_swap_time <= 0) {
            return; //not set - so leave
        }
        var GMT = 2; //We are using GMT+2
        var swap_time = new Date().setUTCHours(24 + GMT); //the time swap is charged tomorrow
        var diff_time = swap_time - Date.now();
        if (diff_time > before_swap_time) {
            return;
        }
        //at this point the trades must be closed to avoid loss
        account.CloseAllTrades("closing-all-trades", "Closing all tradings to avoid hedge loss due to swap increase."); //close both own trades and peer trades
    };
    return SyncService;
}());
exports.SyncService = SyncService;
//# sourceMappingURL=SyncService.js.map