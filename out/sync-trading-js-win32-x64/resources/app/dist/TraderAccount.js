"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraderAccount = void 0;
var main_1 = require("./main");
var Order_1 = require("./Order");
var SyncUtil_1 = require("./SyncUtil");
var Constants_1 = require("./Constants");
var SyncTraderException_1 = require("./SyncTraderException");
var MessageBuffer_1 = require("./MessageBuffer");
var TraderAccount = /** @class */ (function () {
    function TraderAccount(socket) {
        this.orders = new Map();
        this.CopyRetryAttempt = new Map();
        this.CloseRetryAttempt = new Map();
        this.ModifyTargetRetryAttempt = new Map();
        this.ModifyStoplossRetryAttempt = new Map();
        this.PlaceOrderRetryAttempt = new Map();
        this.message = new MessageBuffer_1.MessageBuffer(Constants_1.Constants.NEW_LINE);
        this.last_error = "";
        this.peer = null;
        this.SEP = "_";
        this.MODIFY_TARGET = 1;
        this.MODIFY_STOPLOSS = 2;
        this.SyncPlacingOrders = new Map();
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
    TraderAccount.prototype.Safecopy = function () {
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
            orders: this.Orders(),
            column_index: this.peer != null ? this.PairColumnIndex() : -1,
            pair_id: this.peer != null ? this.PairID() : '',
            last_error: this.last_error,
            peer: this.peer == null ? null : {
                broker: this.peer.broker,
                account_number: this.peer.account_number,
                account_name: this.peer.account_name,
                chart_symbol: this.peer.chart_symbol,
                platform_type: this.peer.platform_type,
                icon_file: this.peer.icon_file,
                is_market_closed: this.peer.is_market_closed,
                is_live_account: this.peer.is_live_account,
                trade_copy_type: this.peer.trade_copy_type,
                orders: this.peer.Orders(),
                column_index: this.peer.PairColumnIndex(),
                pair_id: this.peer.PairID(),
                last_error: this.peer.last_error,
            }
        };
    };
    TraderAccount.prototype.Peer = function () { return this.peer; };
    ;
    TraderAccount.prototype.RemovePeer = function () { return this.peer = null; };
    ;
    TraderAccount.prototype.Broker = function () { return this.broker; };
    ;
    TraderAccount.prototype.AccountNumber = function () { return this.account_number; };
    ;
    TraderAccount.prototype.AccountName = function () { return this.account_name; };
    ;
    TraderAccount.prototype.ChartSymbol = function () { return this.chart_symbol; };
    ;
    TraderAccount.prototype.PlatformType = function () { return this.platform_type; };
    ;
    TraderAccount.prototype.IconFile = function () { return this.icon_file; };
    ;
    TraderAccount.prototype.IsMarketClosed = function () { return this.is_market_closed; };
    ;
    TraderAccount.prototype.IsLiveAccount = function () { return this.is_live_account; };
    ;
    TraderAccount.prototype.GetLastError = function () { return this.last_error; };
    ;
    TraderAccount.prototype.TradeCopyType = function () { return this.trade_copy_type; };
    ;
    TraderAccount.prototype.Dispose = function () { this.socket = null; };
    TraderAccount.prototype.OnSocketData = function (data) {
        this.message.push(data);
    };
    TraderAccount.prototype.OnSocketEnd = function () {
        this.IsSockConnected = false;
        main_1.ipcSend('account-disconnect', this.Safecopy());
    };
    TraderAccount.prototype.OnSocketError = function () {
        this.IsSockConnected = false;
        main_1.ipcSend('account-disconnect', this.Safecopy());
    };
    TraderAccount.prototype.OnSocketClose = function () {
        this.IsSockConnected = false;
        main_1.ipcSend('account-disconnect', this.Safecopy());
    };
    TraderAccount.prototype.IsPlacementOrderClosed = function (uuid) {
        var placement = this.SyncPlacingOrders.get(uuid);
        if (!placement) {
            return true; //meaning we have deleted it
        }
        if (placement.ticket == -1) {
            return false; //most likely the order placement is inprogress
        }
        var order = this.GetOrder(placement.ticket);
        return order ? order.IsClosed() : true;
    };
    /*
     * Ensure that all the orders that are marked to be syncing are reset to false
     *
     */
    TraderAccount.prototype.RsetOrdersSyncing = function () {
        var orders = this.Orders();
        for (var _i = 0, orders_1 = orders; _i < orders_1.length; _i++) {
            var order = orders_1[_i];
            order.SyncCopying(false);
            order.SyncClosing(false);
            order.SyncModifyingStoploss(false);
            order.SyncModifyingTarget(false);
        }
    };
    TraderAccount.prototype.IsSyncingInProgress = function () {
        var orders = this.Orders();
        for (var _i = 0, orders_2 = orders; _i < orders_2.length; _i++) {
            var order = orders_2[_i];
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
        for (var _a = 0, peer_orders_1 = peer_orders; _a < peer_orders_1.length; _a++) {
            var peer_order = peer_orders_1[_a];
            if (peer_order.IsSyncCopying()
                || peer_order.IsSyncClosing()
                || peer_order.IsSyncModifyingStoploss()
                || peer_order.IsSyncModifyingTarget()) {
                return true;
            }
        }
        return false;
    };
    TraderAccount.prototype.SendData = function (data) {
        if (!data.endsWith(Constants_1.Constants.NEW_LINE)) {
            data += Constants_1.Constants.NEW_LINE;
        }
        try {
            this.socket.write(Buffer.from(data));
        }
        catch (e) {
            console.log(e);
        }
    };
    TraderAccount.prototype.HasReceived = function () {
        return !this.message.isFinished();
    };
    TraderAccount.prototype.ReceiveData = function () {
        return this.message.getMessage();
    };
    TraderAccount.prototype.SetBroker = function (broker) {
        this.broker = broker;
    };
    TraderAccount.prototype.SetIconFile = function (icon_file) {
        this.icon_file = icon_file;
    };
    TraderAccount.prototype.SetAccountNumber = function (account_number) {
        this.account_number = account_number;
    };
    TraderAccount.prototype.SetAccountName = function (account_name) {
        this.account_name = account_name;
    };
    TraderAccount.prototype.SetChartSymbol = function (chart_symbol) {
        this.chart_symbol = chart_symbol;
    };
    TraderAccount.prototype.SetPlatformType = function (platform_type) {
        this.platform_type = platform_type;
    };
    TraderAccount.prototype.SetMarketClosed = function (is_market_closed) {
        this.is_market_closed = is_market_closed;
    };
    TraderAccount.prototype.SetIsLiveAccount = function (is_live_account) {
        this.is_live_account = is_live_account;
    };
    TraderAccount.prototype.SetTradeCopyType = function (trade_copy_type) {
        this.trade_copy_type = trade_copy_type;
    };
    TraderAccount.prototype.SetLastError = function (last_error) {
        this.last_error = last_error;
    };
    TraderAccount.prototype.SetPeer = function (peer) {
        if (peer == null) {
            throw new SyncTraderException_1.SyncTraderException("Peer cannot be null");
        }
        if (this.StrID() === peer.StrID()) {
            throw new SyncTraderException_1.SyncTraderException("Compared TraderAccount cannot be the same as peer!");
        }
        this.peer = peer;
    };
    TraderAccount.prototype.EnsureTicketPeer = function (tickectPairs) {
        if (!this.peer) {
            return;
        }
        var paired_tickets = tickectPairs.get(this.PairID());
        if (!paired_tickets) {
            return;
        }
        for (var _i = 0, paired_tickets_1 = paired_tickets; _i < paired_tickets_1.length; _i++) {
            var pair_ticket = paired_tickets_1[_i];
            var own_ticket = pair_ticket[this.PairColumnIndex()];
            var own_order = this.orders.get(own_ticket);
            var peer_ticket = pair_ticket[this.peer.PairColumnIndex()];
            var peer_order = this.peer.orders.get(peer_ticket);
            if (own_order) {
                own_order.peer_ticket = peer_ticket;
            }
            if (peer_order) {
                peer_order.peer_ticket = own_ticket;
            }
        }
    };
    TraderAccount.prototype.IsConnected = function () {
        return this.IsSockConnected;
    };
    TraderAccount.prototype.Ping = function () {
        this.SendData(SyncUtil_1.SyncUtil.PingPacket());
    };
    TraderAccount.prototype.IsKnown = function () {
        return this.broker !== null && this.broker.length > 0 && this.account_number !== null && this.account_number.length > 0;
    };
    TraderAccount.prototype.SetOrder = function (ticket) {
        if (!this.orders.get(ticket)) {
            this.orders.set(ticket, new Order_1.Order(ticket));
        }
    };
    TraderAccount.prototype.GetOrder = function (ticket) {
        return this.orders.get(ticket);
    };
    TraderAccount.prototype.Orders = function () {
        if (this.orders == null)
            return new Order_1.Order[0];
        var arr = Array.from(this.orders.values());
        return arr;
    };
    /**
     *This method will be used to position each peer in the appropriate column when pairing for consistent access location
     */
    TraderAccount.prototype.PairColumnIndex = function () {
        if (this.peer == null) {
            throw new SyncTraderException_1.SyncTraderException("Peer cannot be null");
        }
        if (this.StrID() == this.peer.StrID()) {
            throw new SyncTraderException_1.SyncTraderException("Compared TraderAccount cannot be the same as peer!");
        }
        return this.StrID() < this.peer.StrID() ? 0 : 1;
    };
    /**
     * Generate an id that uniquely identifies the pair
     */
    TraderAccount.prototype.PairID = function () {
        if (this.peer == null) {
            throw new SyncTraderException_1.SyncTraderException("Peer cannot be null");
        }
        if (this.StrID() == this.peer.StrID()) {
            throw new SyncTraderException_1.SyncTraderException("Compared TraderAccount cannot be the same as peer!");
        }
        return this.PairColumnIndex() === 0 ? this.StrID() + this.SEP + this.peer.StrID() : this.peer.StrID() + this.SEP + this.StrID();
    };
    TraderAccount.prototype.StrID = function () {
        return this.broker + this.SEP + this.account_number;
    };
    TraderAccount.prototype.SendGetIntro = function () {
        this.SendData(SyncUtil_1.SyncUtil.Intro());
    };
    TraderAccount.prototype.SignedOrderSpread = function (order) {
        var sign = 1;
        if (order.position == "BUY") {
            sign = 1;
        }
        else {
            sign = -1;
        }
        return order.Spread(this.broker) * sign;
    };
    TraderAccount.prototype.PlaceOrder = function (placement) {
        this.SendData(SyncUtil_1.SyncUtil.SyncPlackeOrderPacket(placement, this.broker));
        main_1.ipcSend('sending-place-order', {
            account: this.Safecopy()
        });
    };
    TraderAccount.prototype.RetrySendPlaceOrder = function (placement) {
        var attempts = this.PlaceOrderRetryAttempt.get(placement.id);
        if (!attempts) {
            attempts = 0;
        }
        attempts++;
        if (attempts > Constants_1.Constants.MAX_PLACE_ORDER_RETRY)
            return;
        this.PlaceOrderRetryAttempt.set(placement.id, attempts);
        this.PlaceOrder(placement);
        SyncUtil_1.SyncUtil.LogPlaceOrderRetry(this, placement.id, attempts);
    };
    TraderAccount.prototype.DoSendCopy = function (order) {
        //mark as copying to avoid duplicate copies
        order.SyncCopying(true);
        this.peer.SendData(SyncUtil_1.SyncUtil.SyncCopyPacket(order, this.peer.trade_copy_type, this.broker));
        main_1.ipcSend('sending-sync-copy', {
            account: this.Safecopy(),
            order: order
        });
    };
    TraderAccount.prototype.DoSendClose = function (own_order, peer_order) {
        //mark as sync closing to avoid duplicate operation
        own_order.SyncClosing(true);
        this.peer.SendData(SyncUtil_1.SyncUtil.SyncClosePacket(peer_order.ticket, own_order.ticket));
        main_1.ipcSend('sending-sync-close', {
            account: this.Safecopy(),
            order: own_order,
            peer_order: peer_order
        });
    };
    TraderAccount.prototype.DoSendModifyTarget = function (own_order, peer_order, new_target) {
        //mark as sync modifying target to avoid duplicate operation
        own_order.SyncModifyingTarget(true);
        this.peer.SendData(SyncUtil_1.SyncUtil.SyncModifyTargetPacket(new_target, peer_order.ticket, own_order.ticket));
        main_1.ipcSend('sending-modify-target', {
            account: this.Safecopy(),
            order: own_order,
            peer_order: peer_order
        });
    };
    TraderAccount.prototype.DoSendModifyStoploss = function (own_order, peer_order, new_stoploss) {
        //mark as sync modifying stoploss to avoid duplicate operation
        own_order.SyncModifyingStoploss(true);
        this.peer.SendData(SyncUtil_1.SyncUtil.SyncModifyStoplossPacket(new_stoploss, peer_order.ticket, own_order.ticket));
        main_1.ipcSend('sending-modify-stoploss', {
            account: this.Safecopy(),
            order: own_order,
            peer_order: peer_order
        });
    };
    /**
     * Send copy to peer
     */
    TraderAccount.prototype.SendCopy = function (unsynced_orders) {
        for (var _i = 0, unsynced_orders_1 = unsynced_orders; _i < unsynced_orders_1.length; _i++) {
            var order = unsynced_orders_1[_i];
            //skip for those that are already closed or copying is in progress
            if (!order.IsCopyable() || order.IsClosed() || order.IsSyncCopying())
                continue;
            this.DoSendCopy(order);
        }
    };
    TraderAccount.prototype.RetrySendCopy = function (origin_ticket) {
        var attempts = this.CopyRetryAttempt.get(origin_ticket);
        if (!attempts) {
            attempts = 0;
        }
        attempts++;
        if (attempts > Constants_1.Constants.MAX_COPY_RETRY)
            return;
        this.CopyRetryAttempt.set(origin_ticket, attempts);
        var order = this.orders.get(origin_ticket);
        this.DoSendCopy(order);
        SyncUtil_1.SyncUtil.LogCopyRetry(this, origin_ticket, attempts);
    };
    TraderAccount.prototype.SendClose = function (synced_orders) {
        for (var _i = 0, synced_orders_1 = synced_orders; _i < synced_orders_1.length; _i++) {
            var paired = synced_orders_1[_i];
            var own_column = this.PairColumnIndex();
            var peer_column = this.peer.PairColumnIndex();
            var own_order = paired[own_column];
            var peer_order = paired[peer_column];
            //skip for those that are still open or sync closing is in progress
            if (!own_order.IsClosed() || own_order.IsSyncClosing())
                continue;
            this.DoSendClose(own_order, peer_order);
        }
    };
    TraderAccount.prototype.RetrySendClose = function (origin_ticket, peer_ticket) {
        var attempts = this.CloseRetryAttempt.get(origin_ticket);
        if (!attempts) {
            attempts = 0;
        }
        if (attempts > Constants_1.Constants.MAX_CLOSE_RETRY)
            return;
        this.CloseRetryAttempt.set(origin_ticket, attempts);
        var order = this.orders.get(origin_ticket);
        var peer_order = this.Peer().orders.get(peer_ticket);
        this.DoSendClose(order, peer_order);
        SyncUtil_1.SyncUtil.LogCloseRetry(this, origin_ticket, peer_ticket, attempts);
    };
    TraderAccount.prototype.SendModify = function (synced_orders) {
        for (var _i = 0, synced_orders_2 = synced_orders; _i < synced_orders_2.length; _i++) {
            var paired = synced_orders_2[_i];
            var own_column = this.PairColumnIndex();
            var peer_column = this.peer.PairColumnIndex();
            var own_order = paired[own_column];
            var peer_order = paired[peer_column];
            //skip for those that are already closed or sync modifying of target is in progress
            if (own_order.IsClosed()) {
                continue;
            }
            var signed_srpread = this.SignedOrderSpread(own_order);
            //according the strategy the stoploss of one is to be equal to the target of its peer
            //so if this is already done, no need to contine, just skip
            var tg_diff = own_order.stoploss - peer_order.target + signed_srpread;
            if (!own_order.IsSyncModifyingTarget()
                && own_order.stoploss > 0
                && !SyncUtil_1.SyncUtil.IsApproxZero(tg_diff)) {
                var new_target = own_order.stoploss + signed_srpread;
                this.DoSendModifyTarget(own_order, peer_order, new_target); //modify peer target be equal to own stoploss
            }
            var st_diff = peer_order.stoploss - own_order.target - signed_srpread;
            if (!own_order.IsSyncModifyingStoploss()
                && own_order.target > 0
                && !SyncUtil_1.SyncUtil.IsApproxZero(st_diff)) {
                var new_stoploss = own_order.target + signed_srpread;
                this.DoSendModifyStoploss(own_order, peer_order, new_stoploss); //modify peer stoploss to be equal to own target
            }
        }
    };
    TraderAccount.prototype.RetrySendModifyTarget = function (origin_ticket, peer_ticket, new_target) {
        var attempts = this.ModifyTargetRetryAttempt.get(origin_ticket);
        if (!attempts) {
            attempts = 0;
        }
        if (attempts > Constants_1.Constants.MAX_MODIFY_RETRY)
            return;
        this.ModifyTargetRetryAttempt.set(origin_ticket, attempts);
        var order = this.orders.get(origin_ticket);
        var peer_order = this.Peer().orders.get(peer_ticket);
        this.DoSendModifyTarget(order, peer_order, new_target);
        SyncUtil_1.SyncUtil.LogModifyTargetRetry(this, origin_ticket, peer_ticket, attempts);
    };
    TraderAccount.prototype.RetrySendModifyStoploss = function (origin_ticket, peer_ticket, new_stoploss) {
        var attempts = this.ModifyStoplossRetryAttempt.get(origin_ticket);
        if (!attempts) {
            attempts = 0;
        }
        if (attempts > Constants_1.Constants.MAX_MODIFY_RETRY)
            return;
        this.ModifyStoplossRetryAttempt.set(origin_ticket, attempts);
        var order = this.orders.get(origin_ticket);
        var peer_order = this.Peer().orders.get(peer_ticket);
        this.DoSendModifyStoploss(order, peer_order, new_stoploss);
        SyncUtil_1.SyncUtil.LogModifyStoplossRetry(this, origin_ticket, peer_ticket, attempts);
    };
    return TraderAccount;
}());
exports.TraderAccount = TraderAccount;
//# sourceMappingURL=TraderAccount.js.map