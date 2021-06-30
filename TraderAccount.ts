

import { ipcSend } from "./main";
import { Order } from "./Order";
import { SyncUtil } from "./SyncUtil";
import { Config } from "./Config";
import { Constants } from "./Constants"; 
import { OrderPlacement } from "./OrderPlacement"; 
import { SyncTraderException } from "./SyncTraderException";
import { MessageBuffer } from './MessageBuffer';
import { PairAccount, PairOrder, PairTicket } from "./Types"

export class TraderAccount {
    
    private version: string;
    private broker: string;
    private account_number: string;
    private account_name: string;
    private chart_symbol: string;
    private platform_type: string;
    private icon_file: string;
    private account_balance: number = 0;
    private account_equity: number = 0;
    private account_credit: number = 0;
    private account_currency: string = "";
    private account_leverage: number = 0;
    private account_margin: number = 0;
    private account_stopout_level: number = 0;
    private account_profit: number = 0;
    private account_free_margin: number = 0;
    private account_swap_per_day: number = 0; 
    private account_trade_cost: number = 0;
    private chart_market_price: number = 0;//this is the current market price on the chart where the EA is loaded
    private hedge_profit: number = 0;
    private hedge_profit_tomorrow: number = 0;
    private trade_copy_type: string;
    private is_market_closed: boolean;
    private is_live_account: boolean|null;
    private orders: Map<number, Order> = new Map<number, Order>();
    private CopyRetryAttempt: Map<number, number> = new Map<number, number>();
    private CloseRetryAttempt: Map<number, number> = new Map<number, number>();
    private ModifyTargetRetryAttempt: Map<number, number> = new Map<number, number>();
    private ModifyStoplossRetryAttempt: Map<number, number> = new Map<number, number>();     
    private PlaceOrderRetryAttempt: Map<string, number> = new Map<string, number>();        
    private message: MessageBuffer = new MessageBuffer(Constants.NEW_LINE);
    private last_error: string = "";
    private peer: TraderAccount | null = null;
    private readonly SEP: string = "_";
    private IsSockConnected: boolean;
    private socket: any;
    private readonly MODIFY_TARGET: number = 1;
    private readonly MODIFY_STOPLOSS: number = 2;
    public SyncPlacingOrders: Map<string, OrderPlacement> = new Map<string, OrderPlacement>();

    constructor(socket: any) {
        this.socket = socket;
        this.IsSockConnected = true;
        socket.on('data', this.OnSocketData.bind(this));
        socket.on('end', this.OnSocketEnd.bind(this));
        socket.on('close', this.OnSocketClose.bind(this));
        socket.on('error', this.OnSocketError.bind(this));
    }

    /**
     *Create a uncircular object of itself so that we don't get circular reference error 
     * when serializing e.g in ipc transmission
     **/
    public Safecopy() {
        
        return {
            version: this.version,
            broker: this.broker,
            account_number: this.account_number,
            account_name: this.account_name,
            account_balance: this.account_balance,
            account_equity: this.account_equity,
            account_credit: this.account_credit,
            account_currency: this.account_currency,
            account_leverage: this.account_leverage,
            account_margin: this.account_margin,
            account_stopout_level: this.account_stopout_level,
            account_profit: this.account_profit,
            account_free_margin: this.account_free_margin,
            hedge_profit: this.hedge_profit,
            hedge_profit_tomorrow: this.hedge_profit_tomorrow,
            chart_symbol: this.chart_symbol,
            chart_market_price: this.chart_market_price,
            platform_type: this.platform_type,
            icon_file: this.icon_file,
            is_market_closed: this.is_market_closed,
            is_live_account: this.is_live_account,
            trade_copy_type: this.trade_copy_type,
            orders: this.Orders(),//array of orders - important!
            column_index: this.peer !=null ? this.PairColumnIndex() : -1,
            pair_id: this.peer != null ? this.PairID() : '',
            last_error: this.last_error,

            peer: this.peer == null ? null : {
                version: this.peer.version,
                broker: this.peer.broker,
                account_number: this.peer.account_number,
                account_name: this.peer.account_name,
                account_balance: this.peer.account_balance,
                account_equity: this.peer.account_equity,
                account_credit: this.peer.account_credit,
                account_currency: this.peer.account_currency,
                account_leverage: this.peer.account_leverage,
                account_margin: this.peer.account_margin,
                account_stopout_level: this.peer.account_stopout_level,
                account_profit: this.peer.account_profit,
                account_free_margin: this.peer.account_free_margin,
                hedge_profit: this.peer.hedge_profit,
                hedge_profit_tomorrow: this.peer.hedge_profit_tomorrow,
                chart_symbol: this.peer.chart_symbol,
                chart_market_price: this.peer.chart_market_price,
                platform_type: this.peer.platform_type,
                icon_file: this.peer.icon_file,
                is_market_closed: this.peer.is_market_closed,
                is_live_account: this.peer.is_live_account,
                trade_copy_type: this.peer.trade_copy_type,
                orders: this.peer.Orders(),//array of orders - important!
                column_index: this.peer.PairColumnIndex(),
                pair_id: this.peer.PairID(),
                last_error: this.peer.last_error,
            }
        }
    }

    public Peer(): TraderAccount { return this.peer };

    public RemovePeer() { return this.peer = null };

    public Version(): string { return this.version };

    public Broker(): string { return this.broker };

    public AccountNumber(): string { return this.account_number };

    public AccountName(): string { return this.account_name };

    public AccountBalance(): number { return this.account_balance };

    public AccountEquity(): number { return this.account_equity };

    public AccountCredit(): number { return this.account_credit };

    public AccountCurrency(): string { return this.account_currency };

    public AccountMargin(): number { return this.account_margin };

    public AccountFreeMargin(): number { return this.account_free_margin };

    public AccountLeverage(): number { return this.account_leverage };

    public AccountStopoutLevel(): number { return this.account_stopout_level };

    public AccountProfit(): number { return this.account_profit };

    public AccountSwapPerDay(): number { return this.account_swap_per_day };

    public AccountTradeCost(): number { return this.account_trade_cost };

    public HedgeProfit(): number { return this.hedge_profit };

    public HedgeProfitTomorrow(): number { return this.hedge_profit_tomorrow };

    public ChartSymbol(): string { return this.chart_symbol };

    public ChartMarketPrice(): number { return this.chart_market_price; };

    public PlatformType(): string { return this.platform_type };

    public IconFile(): string { return this.icon_file };

    public IsMarketClosed(): boolean { return this.is_market_closed };

    public IsLiveAccount(): boolean { return this.is_live_account };

    public GetLastError(): string { return this.last_error };

    TradeCopyType(): string { return this.trade_copy_type };

    public Dispose(): void { this.socket = null }


    private OnSocketData(data: string) {
        this.message.push(data);
    }

    private OnSocketEnd() {
        this.IsSockConnected = false;
        ipcSend('account-disconnect', this.Safecopy());
    }

    private OnSocketError() {
        this.IsSockConnected = false;
        ipcSend('account-disconnect', this.Safecopy());
    }

    private OnSocketClose() {
        this.IsSockConnected = false;
        ipcSend('account-disconnect', this.Safecopy());
    }

    public IsPlacementOrderClosed(uuid: string): boolean {
        var placement = this.SyncPlacingOrders.get(uuid);
        if (!placement) {
            return true;//meaning we have deleted it
        }
        if (placement.ticket == -1) {
            return false;//most likely the order placement is inprogress
        }

        var order: Order = this.GetOrder(placement.ticket);
        if (!order) {
            //return false if order is not found. this is logically correct because the order is yet to be created so it is not really closed.
            //We are only concerned about orders that was open (ie once created) and then closed with a close timestamp on it.
            return false; 
        }
        return order.IsClosed(); 
    }

    /*
     * Ensure that all the orders that are marked to be syncing are reset to false
     * 
     */

    public ResetOrdersSyncing() {
        var orders = this.Orders();
        for (var order of orders) {
            order.SyncCopying(false);
            order.Closing(false);
            order.SyncModifyingStoploss(false);
            order.SyncModifyingTarget(false);
        }
    }

    public IsSyncingInProgress(): boolean {
        var orders = this.Orders();
        for (var order of orders) {
            if (order.IsSyncCopying()
                || order.IsClosing()
                || order.IsSyncModifyingStoploss()
                || order.IsSyncModifyingTarget()) {
                return true;
            }
        }

        //check for peer also

        if (!this.peer) {
            return false;
        }

        var peer_orders = this.peer.Orders();
        for (var peer_order of peer_orders) {
            if (peer_order.IsSyncCopying()
                || peer_order.IsClosing()
                || peer_order.IsSyncModifyingStoploss()
                || peer_order.IsSyncModifyingTarget()) {
                return true;
            }
        }

        return false;
    }

    public SendData(data: string): void {
        
        if (!data.endsWith(Constants.NEW_LINE)) {
            data += Constants.NEW_LINE;
        }
        
        try {
            this.socket.write(Buffer.from(data));
        } catch (e) {
            console.log(e);
        }
    }

    public HasReceived(): boolean {
        return !this.message.isFinished();
    }

    public ReceiveData(): string {
        return this.message.getMessage();
    }

    
    public SetVersion(version: string): void {
        this.version = version
    }
    
    public SetBroker(broker: string): void {
        this.broker = broker
    }

    public SetIconFile(icon_file: string): void {
        this.icon_file = icon_file
    }


    public SetAccountNumber(account_number: string): void {
        this.account_number = account_number
    }


    public SetAccountName(account_name: string): void {
        this.account_name = account_name
    }

    public SetAccountBalance(account_balance: number): void {
        this.account_balance = account_balance
    }

    public SetAccountEquity(account_equity: number): void {
        this.account_equity = account_equity
    }

    public SetAccountCredit(account_credit: number): void {
        this.account_credit = account_credit
    }


    public SetAccountCurrency(account_currency: string): void {
        this.account_currency = account_currency
    }


    public SetAccountLeverage(account_leverage: number): void {
        this.account_leverage = account_leverage
    }


    public SetAccountMargin(account_margin: number): void {
        this.account_margin = account_margin
    }


    public SetAccountStopoutLevel(account_stopout_level: number): void {
        this.account_stopout_level = account_stopout_level
    }


    public SetAccountProfit(account_profit: number): void {
        this.account_profit = account_profit
    }


    public SetAccountFreeMargin(account_free_margin: number): void {
        this.account_free_margin = account_free_margin
    }


    public SetAccountSwapPerDay(account_swap_per_day: number): void {
        this.account_swap_per_day = account_swap_per_day
    }

    public SetAccountTradeCost(account_trade_cost: number): void {
        this.account_trade_cost = account_trade_cost
    }

    public SetHedgeProfit(hedge_profit: number): void {
        this.hedge_profit = hedge_profit
    }

    public SetHedgeProfitTomorrow(hedge_profit_tomorrow: number): void {
        this.hedge_profit_tomorrow = hedge_profit_tomorrow
    }

    public SetChartSymbol(chart_symbol: string): void {
        this.chart_symbol = chart_symbol
    }

    public SetChartMarketPrice(chart_market_price: number): void {
        this.chart_market_price = chart_market_price
    }



    public SetPlatformType(platform_type: string): void {
        this.platform_type = platform_type
    }

    public SetMarketClosed(is_market_closed: boolean): void {
        this.is_market_closed = is_market_closed
    }

    public SetIsLiveAccount(is_live_account: boolean): void {
        this.is_live_account = is_live_account
    }


    public SetTradeCopyType(trade_copy_type: string): void {
        this.trade_copy_type = trade_copy_type
    }

    public SetLastError(last_error: string): void {
        this.last_error = last_error
    }

    public SetPeer(peer: TraderAccount): void {
        if (peer == null) {
            throw new SyncTraderException("Peer cannot be null");
        }
        if (this.StrID() === peer.StrID()) {
            throw new SyncTraderException("Compared TraderAccount cannot be the same as peer!");
        }
        this.peer = peer;
    }

    public EnsureTicketPeer(tickectPairs: Map<string, PairTicket[]>) {
        if (!this.peer) {
            return;
        }
        
        var paired_tickets = tickectPairs.get(this.PairID());
        if (!paired_tickets) {
            return;
        }
        for (var pair_ticket of paired_tickets) {
            
            var own_ticket: number = pair_ticket[this.PairColumnIndex()];
            var own_order = this.orders.get(own_ticket);

            var peer_ticket: number = pair_ticket[this.peer.PairColumnIndex()];
            var peer_order = this.peer.orders.get(peer_ticket);

            if (own_order) {
                own_order.peer_ticket = peer_ticket;
            }

            if (peer_order) {
                peer_order.peer_ticket = own_ticket;
            }

        }
        
    }

    public IsConnected(): boolean {
        return this.IsSockConnected;
    }

    public Ping(): void {
        this.SendData(SyncUtil.PingPacket());
    }

    public IsKnown() {
        return this.broker !== null && this.broker.length > 0 && this.account_number !== null && this.account_number.length > 0;
    }


    public SetOrder(ticket: number) {
        if (!this.orders.get(ticket)) {
            this.orders.set(ticket, new Order(ticket));
        }
    }

    public GetOrder(ticket: number): Order {
        return this.orders.get(ticket);
    }

    public Orders(): Order[] {
        if (this.orders == null)
            return new Order[0];
        var arr: Array<Order> = Array.from(this.orders.values());

        return arr;
    }

    public OpenOrdersCount(): number {
        var count: number = 0;       
        this.orders.forEach(function (order: Order, key, map) {
            if (order.close_time == 0) {
                count++;
            }
        })
        return count;
    }

    public AutoLotSize(peer: TraderAccount): number|string {
        var lot = 0;
        if (this.Peer() == null) {
            return "Peer cannot be null";
        }

        if (this.Peer().StrID() != peer.StrID()) {
            return "The assign peer for computing auto lot size mismatch";
        }


        var smLeverage = this.AccountLeverage() <= this.Peer().AccountLeverage() ?
            this.AccountLeverage()
            : this.Peer().AccountLeverage();

        var risk = 1; //determines the size of account to risk -  0.5 mean half of account; 1 means full account, which is only possible with leverage of >= 200; 2 means twice account possible with >= 400 leverage 

        var factor = 1;

        if (smLeverage == 100) {
            var risk = 0.5;
        }

        if (smLeverage == 100 || smLeverage == 200) {
            factor = 0.98; //just a little less than 1 avoid Not Enough Money error
        }

        lot = this.AccountBalance() * risk * factor / 1000;

        return parseFloat(lot.toFixed(2));
    }

    /**
     *This method will be used to position each peer in the appropriate column when pairing for consistent access location  
     */
    public PairColumnIndex(): number {
        if (this.peer == null) {
            throw new SyncTraderException("Peer cannot be null");
        }
        if (this.StrID() == this.peer.StrID()) {
            throw new SyncTraderException("Compared TraderAccount cannot be the same as peer!");
        }
        return this.StrID() < this.peer.StrID() ? 0 : 1;
    }
    /**
     * Generate an id that uniquely identifies the pair
     */
    public PairID(): string {
        if (this.peer == null) {
            throw new SyncTraderException("Peer cannot be null");
        }
        if (this.StrID() == this.peer.StrID()) {
            throw new SyncTraderException("Compared TraderAccount cannot be the same as peer!");
        }
        return this.PairColumnIndex() === 0 ? this.StrID() + this.SEP + this.peer.StrID() : this.peer.StrID() + this.SEP + this.StrID();
    }

    public StrID(): string {
        return this.broker + this.SEP + this.account_number;
    }

    public SendGetIntro() {
        this.SendData(SyncUtil.Intro());
    }

    private SignedOrderSpread(order: Order): number {
        var sign = 1;
        if (order.position == "BUY") {
            sign = 1;
        } else {
            sign = -1;
        }
        return order.Spread(this.broker) * sign;
    }

    public PlaceOrder(placement: OrderPlacement) {
        this.SendData(SyncUtil.SyncPlackeOrderPacket(placement, this.broker));

        ipcSend('sending-place-order', {
            account: this.Safecopy()
        });
    }

    ValidatePlaceOrder(placement: OrderPlacement) {
        this.SendData(SyncUtil.SyncPlackeValidateOrderPacket(placement, this.broker));
        ipcSend('sending-validate-place-order', {
            account: this.Safecopy()
        });
    }
    

    public RetrySendPlaceOrderOrForceClosePeer(placement: OrderPlacement) {
        var attempts = this.PlaceOrderRetryAttempt.get(placement.id);
        if (!attempts) {
            attempts = 0;
        }

        attempts++;

        if (attempts > Constants.MAX_PLACE_ORDER_RETRY) {
            placement.SetOperationCompleteStatus(OrderPlacement.COMPLETE_FAIL);
            var peer_placement: OrderPlacement = this.Peer().SyncPlacingOrders.get(placement.paired_uuid);
            if (peer_placement) {
                var peer_ticket: number = peer_placement.ticket;
                var reason: string = this.ForceCloseReasonForFailedOrderPlacement(peer_ticket);
                this.Peer().ForceCloseMe(peer_ticket, reason);//forcibly close the peer order
            }
            return;
        }

        this.PlaceOrderRetryAttempt.set(placement.id, attempts);

        this.PlaceOrder(placement);

        SyncUtil.LogPlaceOrderRetry(this, placement.id, attempts);
    }

    private DoSendCopy(order: Order) {

        //mark as copying to avoid duplicate copies
        order.SyncCopying(true);
        this.peer.SendData(SyncUtil.SyncCopyPacket(order, this.peer.trade_copy_type, this.broker));

        ipcSend('sending-sync-copy', {
            account: this.Safecopy(),
            order: order
        });
    }

    private DoSendClose(own_order: Order, peer_order: Order) {

        //mark as sync closing to avoid duplicate operation
        own_order.Closing(true);
        this.peer.SendData(SyncUtil.SyncClosePacket(peer_order.ticket, own_order.ticket));

        ipcSend('sending-sync-close', {
            account: this.Safecopy(),
            order: own_order,
            peer_order: peer_order
        });
    }

    private DoSendOwnClose(order: Order, force: boolean = false, reason: string='') {

        //mark as closing to avoid duplicate operation
        order.Closing(true);
        this.SendData(SyncUtil.OwnClosePacket(order.ticket, force, reason));

        ipcSend('sending-own-close', {
            account: this.Safecopy(),
            order: order,
            force: force,
            reason:reason
        });
    }

    private DoSendModifyTarget(own_order: Order, peer_order: Order, new_target: number) {

        //mark as sync modifying target to avoid duplicate operation
        own_order.SyncModifyingTarget(true);

        this.peer.SendData(SyncUtil.SyncModifyTargetPacket(new_target, peer_order.ticket, own_order.ticket));

        ipcSend('sending-modify-target', {
            account: this.Safecopy(),
            order: own_order,
            peer_order: peer_order
        });
    }

    private DoSendModifyStoploss(own_order: Order, peer_order: Order, new_stoploss: number) {

        //mark as sync modifying stoploss to avoid duplicate operation
        own_order.SyncModifyingStoploss(true);
        
        this.peer.SendData(SyncUtil.SyncModifyStoplossPacket(new_stoploss, peer_order.ticket, own_order.ticket));

        ipcSend('sending-modify-stoploss', {
            account: this.Safecopy(),
            order: own_order,
            peer_order: peer_order
        });
    }

    public ForceCloseReasonForFailedSyncCopy(ticket: number) {
        return `Forcibly closed order #${ticket} because sync copy failed after maximum retry attempts of ${Constants.MAX_COPY_RETRY}.`;
    }

    public ForceCloseReasonForFailedOrderPlacement(ticket: number) {
        return `Forcibly closed order #${ticket} because sync order placement failed after maximum retry attempts of ${Constants.MAX_PLACE_ORDER_RETRY}.`;
    }

    public DefaultForceCloseReason(ticket: number) {
        return `Forcibly closed order #${ticket} because possibly sync copy or order placement failed`;
    }

    public ForceCloseMe(ticket: number, reason: string = this.DefaultForceCloseReason(ticket)) {       
        let order: Order = this.orders.get(ticket);
        if (order) {
            this.DoSendOwnClose(order, true, reason);
        }
    }

    public CloseAllTrades(event: string = null, comment: string = null) {

        var atleastOne = false;

        this.orders.forEach((order: Order, ticket: number) => {
            if (order.IsClosed() || order.IsClosing()) {
                return;
            }

            atleastOne = true;

            this.DoSendOwnClose(order);
        })

        if (this.peer) {
            this.peer.orders.forEach((order: Order, ticket: number) => {
                if (order.IsClosed() || order.IsClosing()) {
                    return;
                }

                atleastOne = true;

                this.DoSendOwnClose(order);
            })

        }
        
        if (atleastOne && event) {
            ipcSend(event, comment);
        }
        
    }

    /**
     * Send copy to peer
     */
    public SendCopy(unsynced_orders: Array<Order>) {
        for (let order of unsynced_orders) {

            //skip for those that are already closed or copying is in progress
            if (!order.IsCopyable() || order.IsClosed() || order.IsSyncCopying())
                continue;

            this.DoSendCopy(order);
        }
    }

    public RetrySendCopyOrForceCloseMe(origin_ticket: number) {
        var attempts = this.CopyRetryAttempt.get(origin_ticket); 
        if (!attempts) {
            attempts = 0;
        }

        attempts++;

        if (attempts > Constants.MAX_COPY_RETRY) {
            var reason: string = this.ForceCloseReasonForFailedSyncCopy(origin_ticket);
            this.ForceCloseMe(origin_ticket, reason);//forcely close the order
            return;
        }

        this.CopyRetryAttempt.set(origin_ticket , attempts);

        let order: Order = this.orders.get(origin_ticket);
        this.DoSendCopy(order);

        SyncUtil.LogCopyRetry(this, origin_ticket, attempts);
    }

    public SendClose(synced_orders: Array<PairOrder>) {

        for (let paired of synced_orders) {
            let own_column: number = this.PairColumnIndex();
            let peer_column: number = this.peer.PairColumnIndex();
            var own_order = paired[own_column];
            var peer_order = paired[peer_column];
            //skip for those that are still open or sync closing is in progress
            if (!own_order.IsClosed() || own_order.IsClosing())
                continue;

            this.DoSendClose(own_order, peer_order);
        }
    }

    public RetrySendOwnClose(ticket: number) {

        var attempts = this.CloseRetryAttempt.get(ticket);
        if (!attempts) {
            attempts = 0;
        }

        if (attempts > Constants.MAX_CLOSE_RETRY)
            return;

        this.CloseRetryAttempt.set(ticket, attempts);

        let order: Order = this.orders.get(ticket);
        this.DoSendOwnClose(order);

        SyncUtil.LogOwnCloseRetry(this, ticket, attempts);
    }

    public RetrySendClose(origin_ticket: number, peer_ticket: number) {

        var attempts = this.CloseRetryAttempt.get(origin_ticket);
        if (!attempts) {
            attempts = 0;
        }

        if (attempts > Constants.MAX_CLOSE_RETRY)
            return;

        this.CloseRetryAttempt.set(origin_ticket, attempts);

        let order: Order = this.orders.get(origin_ticket);
        let peer_order: Order = this.Peer().orders.get(peer_ticket);
        this.DoSendClose(order, peer_order);

        SyncUtil.LogCloseRetry(this, origin_ticket, peer_ticket, attempts);
    }

    public SendModify(synced_orders: Array<PairOrder>) {

        for (let paired of synced_orders) {
            let own_column: number = this.PairColumnIndex();
            let peer_column: number = this.peer.PairColumnIndex();
            var own_order = paired[own_column];
            var peer_order = paired[peer_column];

            //skip for those that are already closed or sync modifying of target is in progress
            if (own_order.IsClosed()) {
                continue;
            }


            var signed_srpread = this.SignedOrderSpread(own_order);

            //according the strategy the stoploss of one is to be equal to the target of its peer
            //so if this is already done, no need to contine, just skip

            
            var tg_diff: number = own_order.stoploss - peer_order.target + signed_srpread;

            if (!own_order.IsSyncModifyingTarget()
                && own_order.stoploss > 0
                && !SyncUtil.IsApproxZero(tg_diff)) {

                var new_target: number = own_order.stoploss + signed_srpread;

                this.DoSendModifyTarget(own_order, peer_order, new_target);//modify peer target be equal to own stoploss
            }

            
            var st_diff: number = peer_order.stoploss - own_order.target  - signed_srpread;

            if (!own_order.IsSyncModifyingStoploss()
                && own_order.target > 0
                && !SyncUtil.IsApproxZero(st_diff)) {

                var new_stoploss: number = own_order.target + signed_srpread;

                this.DoSendModifyStoploss(own_order, peer_order, new_stoploss);//modify peer stoploss to be equal to own target
            }

            

        }
    }

    public RetrySendModifyTarget(origin_ticket: number, peer_ticket: number, new_target: number) {

        var attempts = this.ModifyTargetRetryAttempt.get(origin_ticket);
        if (!attempts) {
            attempts = 0;
        }

        if (attempts > Constants.MAX_MODIFY_RETRY)
            return;

        this.ModifyTargetRetryAttempt.set(origin_ticket, attempts);

        let order: Order = this.orders.get(origin_ticket);
        let peer_order: Order = this.Peer().orders.get(peer_ticket);
        this.DoSendModifyTarget(order, peer_order, new_target);

        SyncUtil.LogModifyTargetRetry(this, origin_ticket, peer_ticket, attempts);
    }   
        
    public RetrySendModifyStoploss(origin_ticket: number, peer_ticket: number, new_stoploss: number) {

        var attempts = this.ModifyStoplossRetryAttempt.get(origin_ticket);
        if (!attempts) {
            attempts = 0;
        }

        if (attempts > Constants.MAX_MODIFY_RETRY)
            return;

        this.ModifyStoplossRetryAttempt.set(origin_ticket, attempts);

        let order: Order = this.orders.get(origin_ticket);
        let peer_order: Order = this.Peer().orders.get(peer_ticket);
        this.DoSendModifyStoploss(order, peer_order, new_stoploss);

        SyncUtil.LogModifyStoplossRetry(this, origin_ticket, peer_ticket, attempts);
    }

}
