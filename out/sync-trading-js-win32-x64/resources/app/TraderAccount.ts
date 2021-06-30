

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
    
    private broker: string;
    private account_number: string;
    private account_name: string;
    private chart_symbol: string;
    private platform_type: string;
    private icon_file: string;
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
            broker: this.broker,
            account_number: this.account_number,
            account_name: this.account_name,
            chart_symbol: this.chart_symbol,
            platform_type: this.platform_type,
            icon_file: this.icon_file,
            is_market_closed: this.is_market_closed,
            is_live_account: this.is_live_account,
            trade_copy_type: this.trade_copy_type,
            orders: this.Orders(),//array of orders - important!
            column_index: this.peer !=null ? this.PairColumnIndex() : -1,
            pair_id: this.peer != null ? this.PairID() : '',
            last_error: this.last_error,

            peer: this.peer ==null ? null : {
                broker: this.peer.broker,
                account_number: this.peer.account_number,
                account_name: this.peer.account_name,
                chart_symbol: this.peer.chart_symbol,
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

    public Broker(): string { return this.broker };

    public AccountNumber(): string { return this.account_number };

    public AccountName(): string { return this.account_name };

    public ChartSymbol(): string { return this.chart_symbol };

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

        return order? order.IsClosed() : true;
    }

    /*
     * Ensure that all the orders that are marked to be syncing are reset to false
     * 
     */

    public RsetOrdersSyncing() {
        var orders = this.Orders();
        for (var order of orders) {
            order.SyncCopying(false);
            order.SyncClosing(false);
            order.SyncModifyingStoploss(false);
            order.SyncModifyingTarget(false);
        }
    }

    public IsSyncingInProgress(): boolean {
        var orders = this.Orders();
        for (var order of orders) {
            if (order.IsSyncCopying()
                || order.IsSyncClosing()
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
                || peer_order.IsSyncClosing()
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


    public SetChartSymbol(chart_symbol: string): void {
        this.chart_symbol = chart_symbol
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

    PlaceOrder(placement: OrderPlacement) {
        this.SendData(SyncUtil.SyncPlackeOrderPacket(placement, this.broker));

        ipcSend('sending-place-order', {
            account: this.Safecopy()
        });
    }


    public RetrySendPlaceOrder(placement: OrderPlacement) {
        var attempts = this.PlaceOrderRetryAttempt.get(placement.id);
        if (!attempts) {
            attempts = 0;
        }

        attempts++;

        if (attempts > Constants.MAX_PLACE_ORDER_RETRY)
            return;

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
        own_order.SyncClosing(true);
        this.peer.SendData(SyncUtil.SyncClosePacket(peer_order.ticket, own_order.ticket));

        ipcSend('sending-sync-close', {
            account: this.Safecopy(),
            order: own_order,
            peer_order: peer_order
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

    public RetrySendCopy(origin_ticket: number) {
        var attempts = this.CopyRetryAttempt.get(origin_ticket); 
        if (!attempts) {
            attempts = 0;
        }

        attempts++;

        if (attempts > Constants.MAX_COPY_RETRY)
            return;

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
            if (!own_order.IsClosed() || own_order.IsSyncClosing())
                continue;

            this.DoSendClose(own_order, peer_order);
        }
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
