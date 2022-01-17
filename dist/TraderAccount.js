"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraderAccount = void 0;
var main_1 = require("./main");
var Order_1 = require("./Order");
var SyncUtil_1 = require("./SyncUtil");
var Constants_1 = require("./Constants");
var OrderPlacement_1 = require("./OrderPlacement");
var SyncTraderException_1 = require("./SyncTraderException");
var MessageBuffer_1 = require("./MessageBuffer");
var TraderAccount = /** @class */ (function () {
    function TraderAccount(socket) {
        this.chart_symbol_max_lot_size = 0;
        this.chart_symbol_min_lot_size = 0;
        this.chart_symbol_tick_value = 0;
        this.chart_symbol_swap_long = 0;
        this.chart_symbol_swap_short = 0;
        this.chart_symbol_trade_units = 0;
        this.chart_symbol_spread = 0;
        this.account_balance = 0;
        this.account_equity = 0;
        this.account_credit = 0;
        this.account_currency = "";
        this.account_leverage = 0;
        this.account_margin = 0;
        this.account_stopout_level = 0;
        this.account_profit = 0;
        this.account_free_margin = 0;
        this.account_swap_per_day = 0;
        this.account_trade_cost = 0;
        this.chart_market_price = 0; //this is the current market price on the chart where the EA is loaded
        this.hedge_profit = 0;
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
        this.EACommandList = new Map();
        this.test = 0;
        this.test = 7;
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
            terminal_connected: this.terminal_connected,
            only_trade_with_credit: this.only_trade_with_credit,
            chart_symbol: this.chart_symbol,
            chart_symbol_trade_allowed: this.chart_symbol_trade_allowed,
            chart_symbol_max_lot_size: this.chart_symbol_max_lot_size,
            chart_symbol_min_lot_size: this.chart_symbol_min_lot_size,
            chart_symbol_tick_value: this.chart_symbol_tick_value,
            chart_symbol_swap_long: this.chart_symbol_swap_long,
            chart_symbol_swap_short: this.chart_symbol_swap_short,
            chart_symbol_trade_units: this.chart_symbol_trade_units,
            chart_symbol_spread: this.chart_symbol_spread,
            chart_market_price: this.chart_market_price,
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
                terminal_connected: this.peer.terminal_connected,
                only_trade_with_credit: this.peer.only_trade_with_credit,
                chart_symbol: this.peer.chart_symbol,
                chart_symbol_trade_allowed: this.peer.chart_symbol_trade_allowed,
                chart_symbol_max_lot_size: this.peer.chart_symbol_max_lot_size,
                chart_symbol_min_lot_size: this.peer.chart_symbol_min_lot_size,
                chart_symbol_tick_value: this.peer.chart_symbol_tick_value,
                chart_symbol_swap_long: this.peer.chart_symbol_swap_long,
                chart_symbol_swap_short: this.peer.chart_symbol_swap_short,
                chart_symbol_trade_units: this.peer.chart_symbol_trade_units,
                chart_symbol_spread: this.peer.chart_symbol_spread,
                chart_market_price: this.peer.chart_market_price,
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
    TraderAccount.prototype.RemovePeer = function () {
        if (!this.peer)
            return;
        this.SendData(SyncUtil_1.SyncUtil.UnpairedNotificationPacket(this.peer.broker, this.peer.account_number));
        return this.peer = null;
    };
    ;
    TraderAccount.prototype.Version = function () { return this.version; };
    ;
    TraderAccount.prototype.Broker = function () { return this.broker; };
    ;
    TraderAccount.prototype.AccountNumber = function () { return this.account_number; };
    ;
    TraderAccount.prototype.AccountName = function () { return this.account_name; };
    ;
    TraderAccount.prototype.AccountBalance = function () { return this.account_balance; };
    ;
    TraderAccount.prototype.AccountEquity = function () { return this.account_equity; };
    ;
    TraderAccount.prototype.AccountCredit = function () { return this.account_credit; };
    ;
    TraderAccount.prototype.AccountCurrency = function () { return this.account_currency; };
    ;
    TraderAccount.prototype.AccountMargin = function () { return this.account_margin; };
    ;
    TraderAccount.prototype.AccountFreeMargin = function () { return this.account_free_margin; };
    ;
    TraderAccount.prototype.AccountLeverage = function () { return this.account_leverage; };
    ;
    TraderAccount.prototype.AccountStopoutLevel = function () { return this.account_stopout_level; };
    ;
    TraderAccount.prototype.AccountProfit = function () { return this.account_profit; };
    ;
    TraderAccount.prototype.AccountSwapPerDay = function () { return this.account_swap_per_day; };
    ;
    TraderAccount.prototype.AccountTradeCost = function () { return this.account_trade_cost; };
    ;
    TraderAccount.prototype.HedgeProfit = function () { return this.hedge_profit; };
    ;
    TraderAccount.prototype.TerminalConnected = function () { return this.terminal_connected; };
    ;
    TraderAccount.prototype.OnlyTradeWithCredit = function () { return this.only_trade_with_credit; };
    ;
    TraderAccount.prototype.ChartSymbol = function () { return this.chart_symbol; };
    ;
    TraderAccount.prototype.ChartSymbolTradeAllowed = function () { return this.chart_symbol_trade_allowed; };
    ;
    TraderAccount.prototype.ChartSymbolMaxLotSize = function () { return this.chart_symbol_max_lot_size; };
    ;
    TraderAccount.prototype.ChartSymbolMinLotSize = function () { return this.chart_symbol_min_lot_size; };
    ;
    TraderAccount.prototype.ChartSymbolTickValue = function () { return this.chart_symbol_tick_value; };
    ;
    TraderAccount.prototype.ChartSymbolSwapLong = function () { return this.chart_symbol_swap_long; };
    ;
    TraderAccount.prototype.ChartSymbolSwapShort = function () { return this.chart_symbol_swap_short; };
    ;
    TraderAccount.prototype.ChartSymbolTradeUnits = function () { return this.chart_symbol_trade_units; };
    ;
    TraderAccount.prototype.ChartSymbolSpread = function () { return this.chart_symbol_spread; };
    ;
    TraderAccount.prototype.ChartMarketPrice = function () { return this.chart_market_price; };
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
        if (!order) {
            //return false if order is not found. this is logically correct because the order is yet to be created so it is not really closed.
            //We are only concerned about orders that was open (ie once created) and then closed with a close timestamp on it.
            return false;
        }
        return order.IsClosed();
    };
    /*
     * Ensure that all the orders that are marked to be syncing are reset to false
     *
     */
    TraderAccount.prototype.ResetOrdersSyncing = function () {
        var orders = this.Orders();
        for (var _i = 0, orders_1 = orders; _i < orders_1.length; _i++) {
            var order = orders_1[_i];
            order.SyncCopying(false);
            order.Closing(false);
            order.SyncModifyingStoploss(false);
            order.SyncModifyingTarget(false);
        }
    };
    TraderAccount.prototype.IsSyncingInProgress = function () {
        var orders = this.Orders();
        for (var _i = 0, orders_2 = orders; _i < orders_2.length; _i++) {
            var order = orders_2[_i];
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
        for (var _a = 0, peer_orders_1 = peer_orders; _a < peer_orders_1.length; _a++) {
            var peer_order = peer_orders_1[_a];
            if (peer_order.IsSyncCopying()
                || peer_order.IsClosing()
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
    TraderAccount.prototype.SetVersion = function (version) {
        this.version = version;
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
    TraderAccount.prototype.SetAccountBalance = function (account_balance) {
        this.account_balance = account_balance;
    };
    TraderAccount.prototype.SetAccountEquity = function (account_equity) {
        this.account_equity = account_equity;
    };
    TraderAccount.prototype.SetAccountCredit = function (account_credit) {
        this.account_credit = account_credit;
    };
    TraderAccount.prototype.SetAccountCurrency = function (account_currency) {
        this.account_currency = account_currency;
    };
    TraderAccount.prototype.SetAccountLeverage = function (account_leverage) {
        this.account_leverage = account_leverage;
    };
    TraderAccount.prototype.SetAccountMargin = function (account_margin) {
        this.account_margin = account_margin;
    };
    TraderAccount.prototype.SetAccountStopoutLevel = function (account_stopout_level) {
        this.account_stopout_level = account_stopout_level;
    };
    TraderAccount.prototype.SetAccountProfit = function (account_profit) {
        this.account_profit = account_profit;
    };
    TraderAccount.prototype.SetAccountFreeMargin = function (account_free_margin) {
        this.account_free_margin = account_free_margin;
    };
    TraderAccount.prototype.SetAccountSwapPerDay = function (account_swap_per_day) {
        this.account_swap_per_day = account_swap_per_day;
    };
    TraderAccount.prototype.SetAccountTradeCost = function (account_trade_cost) {
        this.account_trade_cost = account_trade_cost;
    };
    TraderAccount.prototype.SetHedgeProfit = function (hedge_profit) {
        this.hedge_profit = hedge_profit;
    };
    TraderAccount.prototype.GetCommissionPerLot = function (symbol) {
        var commsionConfig = SyncUtil_1.SyncUtil.AppConfigMap.get('brokers_commission_per_lot');
        if (!commsionConfig
            || !commsionConfig[this.broker]
            || !commsionConfig[this.broker][this.account_number]) {
            return "unknown";
        }
        var commission = commsionConfig[this.broker][this.account_number][symbol];
        if (commission === 0 || commission < 0 || commission > 0) {
            return commission;
        }
        return 'unknown';
    };
    TraderAccount.prototype.SetSymbolCommissionPerLot = function (symbol, conmission_per_lot) {
        var saved_conmission_per_lot = this.GetCommissionPerLot(symbol);
        if (saved_conmission_per_lot === conmission_per_lot) {
            return;
        }
        var commsionConfig = SyncUtil_1.SyncUtil.AppConfigMap.get('brokers_commission_per_lot');
        if (!commsionConfig) {
            commsionConfig = {};
        }
        if (!commsionConfig[this.broker]) {
            commsionConfig[this.broker] = {};
        }
        if (!commsionConfig[this.broker][this.account_number]) {
            commsionConfig[this.broker][this.account_number] = {};
        }
        if (!commsionConfig[this.broker][this.account_number][symbol]) {
            commsionConfig[this.broker][this.account_number][symbol] = conmission_per_lot;
        }
        SyncUtil_1.SyncUtil.AppConfigMap.set('brokers_commission_per_lot', commsionConfig);
        var configObj = SyncUtil_1.SyncUtil.MapToObject(SyncUtil_1.SyncUtil.AppConfigMap);
        SyncUtil_1.SyncUtil.SaveAppConfig(configObj, function (success) {
            //TODO - report error if any
        });
    };
    TraderAccount.prototype.SetTerminalConnected = function (terminal_connected) {
        this.terminal_connected = terminal_connected;
    };
    TraderAccount.prototype.SetOnlyTradeWithCredit = function (only_trade_with_credit) {
        this.only_trade_with_credit = only_trade_with_credit;
    };
    TraderAccount.prototype.SetChartSymbol = function (chart_symbol) {
        this.chart_symbol = chart_symbol;
    };
    TraderAccount.prototype.SetChartSymbolTradeAllowed = function (chart_symbol_trade_allowed) {
        this.chart_symbol_trade_allowed = chart_symbol_trade_allowed;
    };
    TraderAccount.prototype.SetChartSymbolMaxLotSize = function (chart_symbol_max_lot_size) {
        this.chart_symbol_max_lot_size = chart_symbol_max_lot_size;
    };
    TraderAccount.prototype.SetChartSymbolMinLotSize = function (chart_symbol_min_lot_size) {
        this.chart_symbol_min_lot_size = chart_symbol_min_lot_size;
    };
    TraderAccount.prototype.SetChartSymbolTickValue = function (chart_symbol_tick_value) {
        this.chart_symbol_tick_value = chart_symbol_tick_value;
    };
    TraderAccount.prototype.SetChartSymbolSwapLong = function (chart_symbol_swap_long) {
        this.chart_symbol_swap_long = chart_symbol_swap_long;
    };
    TraderAccount.prototype.SetChartSymbolSwapShort = function (chart_symbol_swap_short) {
        this.chart_symbol_swap_short = chart_symbol_swap_short;
    };
    TraderAccount.prototype.SetChartSymbolTradeUnits = function (chart_symbol_trade_units) {
        this.chart_symbol_trade_units = chart_symbol_trade_units;
    };
    TraderAccount.prototype.SetChartSymbolSpread = function (chart_symbol_spread) {
        this.chart_symbol_spread = chart_symbol_spread;
    };
    TraderAccount.prototype.SetChartMarketPrice = function (chart_market_price) {
        this.chart_market_price = chart_market_price;
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
    TraderAccount.prototype.OpenOrdersCount = function () {
        var count = 0;
        this.orders.forEach(function (order, key, map) {
            if (order.close_time == 0) {
                count++;
            }
        });
        return count;
    };
    TraderAccount.prototype.CalculateMarginRequire = function (lot) {
        return lot * this.ChartSymbolTradeUnits() * this.ChartMarketPrice() / this.AccountLeverage();
    };
    TraderAccount.prototype.CalculateCommision = function (lot, symbol) {
        if (symbol === void 0) { symbol = this.chart_symbol; }
        var comm_per_lot = this.GetCommissionPerLot(symbol);
        return !isNaN(comm_per_lot) ? (comm_per_lot * lot) : 0;
    };
    TraderAccount.prototype.IsCommisionKnown = function (symbol) {
        if (symbol === void 0) { symbol = this.chart_symbol; }
        var comm_per_lot = this.GetCommissionPerLot(symbol);
        return !isNaN(comm_per_lot);
    };
    TraderAccount.prototype.CalculateSpreadCost = function (lot) {
        var cost = -Math.abs(this.ChartSymbolSpread() * lot); //must alway return negative
        return parseFloat(cost.toFixed(2));
    };
    TraderAccount.prototype.CalculateSwapPerDay = function (position, lot) {
        var swap = 0;
        if (position == 'BUY') {
            swap = this.ChartSymbolSwapLong();
        }
        else if (position == 'SELL') {
            swap = this.ChartSymbolSwapShort();
        }
        var cost = swap * lot;
        return parseFloat(cost.toFixed(2));
    };
    TraderAccount.prototype.AmmountToPips = function (amount, lots) {
        return amount / (lots * this.ChartSymbolTickValue());
    };
    TraderAccount.prototype.DetermineLotSizefromPips = function (pips) {
        var lot = (this.AccountBalance() + this.AccountCredit()) /
            (pips * this.ChartSymbolTickValue() + this.ChartSymbolTradeUnits() * this.ChartMarketPrice() / this.AccountLeverage() * this.AccountStopoutLevel() / 100);
        return parseFloat(lot.toFixed(2));
    };
    TraderAccount.prototype.DetermineLossAtStopout = function (position, lot) {
        /*double margin =  AccountMargin();
        double stopout_margin = margin * AccountStopoutLevel() / 100;
        double stopout_loss = AccountBalance() + AccountCredit() + OrderCommission() + OrderSwap() - stopout_margin;
        double stopout_pip_move = ammountToPips(stopout_loss, OrderLots(), OrderSymbol());*/
        var margin = this.CalculateMarginRequire(lot);
        var stopout_margin = margin * this.AccountStopoutLevel() / 100;
        var stopout_loss = this.AccountBalance() + this.AccountCredit() + this.CalculateCommision(lot) - stopout_margin;
        return parseFloat(stopout_loss.toFixed(2));
    };
    TraderAccount.prototype.DeterminePipsMoveAtStopout = function (position, lot) {
        var stopout_loss = this.DetermineLossAtStopout(position, lot);
        if (isNaN(stopout_loss)) {
            return stopout_loss;
        }
        var stoput_pip_move = this.AmmountToPips(stopout_loss, lot);
        return parseFloat(stoput_pip_move.toFixed(2));
    };
    TraderAccount.prototype.sendEACommand = function (commmand, prop, callback) {
        var command_id = SyncUtil_1.SyncUtil.Unique();
        var cmdObj = {
            name: commmand,
            callback: callback
        };
        this.EACommandList.set(command_id, cmdObj);
        this.SendData(SyncUtil_1.SyncUtil.CommandPacket(cmdObj.name, command_id, prop));
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
        this.SendData(SyncUtil_1.SyncUtil.SyncPlackeOrderPacket(placement, this.broker, this.account_number));
        main_1.ipcSend('sending-place-order', {
            account: this.Safecopy()
        });
    };
    TraderAccount.prototype.ValidatePlaceOrder = function (symbol, lot_size, max_percent_diff_in_account_balances, is_triggered) {
        if (max_percent_diff_in_account_balances === void 0) { max_percent_diff_in_account_balances = Infinity; }
        if (is_triggered === void 0) { is_triggered = false; }
        var valid = false;
        var perecent = 0;
        if (max_percent_diff_in_account_balances >= 0 &&
            this.AccountBalance() > 0 &&
            this.Peer().AccountBalance() > 0) {
            perecent = Math.abs(((this.AccountBalance() - this.Peer().AccountBalance()) /
                this.AccountBalance()) *
                100);
        }
        var err_prefix = is_triggered ? "Trigger validation error!\n" : "";
        if (!this.TerminalConnected()) {
            this.SetLastError(err_prefix + "Terminal is disconnected!");
        }
        else if (this.AccountBalance() <= 0) {
            this.SetLastError(err_prefix + "Not allowed! Account balance must be greater than zero.");
        }
        else if (this.OnlyTradeWithCredit() && this.IsLiveAccount() && this.AccountCredit() == 0) {
            this.SetLastError(err_prefix + "Not allowed for live account! Credit cannot be zero.");
        }
        else if (lot_size > this.ChartSymbolMaxLotSize()) {
            this.SetLastError(err_prefix + "Maximum lot size of " + this.ChartSymbolMaxLotSize() + " exceeded! The specified lot size of " + lot_size + " is too big.");
        }
        else if (lot_size < this.ChartSymbolMinLotSize()) {
            this.SetLastError(err_prefix + "Cannot be below mininiun lot size of " + this.ChartSymbolMinLotSize() + ". The specified lot size of " + lot_size + " is too small.");
        }
        else if (this.IsMarketClosed()) {
            this.SetLastError(err_prefix + "Market is closed!");
        }
        else if (!this.ChartSymbolTradeAllowed()) {
            this.SetLastError(err_prefix + "Trade not allowed for " + this.ChartSymbol() + ". Check if symbol is disabled or market is closed.");
        }
        else if (this.ChartSymbol() !== SyncUtil_1.SyncUtil.GetRelativeSymbol(symbol, this.Broker(), this.AccountNumber())) {
            this.SetLastError(err_prefix + "Not allowed! Chart symbol must be same as trade symbol. Symbol on chart is " + this.ChartSymbol() + " while trade is " + symbol);
        }
        else if (perecent > max_percent_diff_in_account_balances) {
            this.SetLastError(err_prefix + "Percent difference in account balance, " + this
                .AccountBalance()
                .toFixed(2) + this.AccountCurrency() + " of [" + this.Broker() + " , " + this.AccountNumber() + "]  from that of " + this.Peer()
                .AccountBalance()
                .toFixed(2) + this.Peer().AccountCurrency() + " of [" + this.Peer().Broker() + " , " + this.Peer().AccountNumber() + "] which is " + perecent.toFixed(2) + "% is greater than the allowable maximum of " + max_percent_diff_in_account_balances + "%");
        }
        else {
            valid = true;
        }
        if (!valid) {
            main_1.ipcSend("validate-place-order-fail", this.Safecopy());
        }
        return valid;
    };
    TraderAccount.prototype.IsAllGroupOrdersOpenAnNotClosing = function (own_order, peer_order) {
        var orders = this.Orders();
        var own_group_order_open_count = 0;
        for (var _i = 0, orders_3 = orders; _i < orders_3.length; _i++) {
            var order = orders_3[_i];
            if (order.GropuId() === own_order.GropuId()
                && order.IsOpen() //order must be open
                && !order.IsClosing() //order must not be in closing state
            ) {
                own_group_order_open_count++;
            }
        }
        if (!this.Peer())
            return false;
        var peer_orders = this.Peer().Orders();
        var peer_group_order_open_count = 0;
        for (var _a = 0, peer_orders_2 = peer_orders; _a < peer_orders_2.length; _a++) {
            var order = peer_orders_2[_a];
            if (order.GropuId() === peer_order.GropuId()
                && order.IsOpen() //order must be open
                && !order.IsClosing() //order must not be in closing state
            ) {
                peer_group_order_open_count++;
            }
        }
        return own_group_order_open_count === own_order.GroupOrderCount()
            && peer_group_order_open_count === peer_order.GroupOrderCount();
    };
    TraderAccount.prototype.RetrySendPlaceOrderOrForceClosePeer = function (placement) {
        var attempts = this.PlaceOrderRetryAttempt.get(placement.id);
        if (!attempts) {
            attempts = 0;
        }
        attempts++;
        if (attempts > Constants_1.Constants.MAX_PLACE_ORDER_RETRY) {
            placement.SetOperationCompleteStatus(OrderPlacement_1.OrderPlacement.COMPLETE_FAIL);
            var peer_placement = this.Peer().SyncPlacingOrders.get(placement.paired_uuid);
            if (peer_placement) {
                var peer_ticket = peer_placement.ticket;
                var reason = this.ForceCloseReasonForFailedOrderPlacement(peer_ticket);
                this.Peer().ForceCloseMe(peer_ticket, reason); //forcibly close the peer order
            }
            return;
        }
        this.PlaceOrderRetryAttempt.set(placement.id, attempts);
        this.PlaceOrder(placement);
        SyncUtil_1.SyncUtil.LogPlaceOrderRetry(this, placement.id, attempts);
    };
    TraderAccount.prototype.DoSendCopy = function (order) {
        //mark as copying to avoid duplicate copies
        order.SyncCopying(true);
        this.peer.SendData(SyncUtil_1.SyncUtil.SyncCopyPacket(order, this.peer.trade_copy_type, this.broker, this.account_number));
        main_1.ipcSend('sending-sync-copy', {
            account: this.Safecopy(),
            order: order
        });
    };
    TraderAccount.prototype.DoSendClose = function (own_order, peer_order) {
        //mark as sync closing to avoid duplicate operation
        own_order.Closing(true);
        this.peer.SendData(SyncUtil_1.SyncUtil.SyncClosePacket(peer_order.ticket, own_order.ticket));
        main_1.ipcSend('sending-sync-close', {
            account: this.Safecopy(),
            order: own_order,
            peer_order: peer_order
        });
    };
    TraderAccount.prototype.DoSendOwnClose = function (order, force, reason) {
        if (force === void 0) { force = false; }
        if (reason === void 0) { reason = ''; }
        //mark as closing to avoid duplicate operation
        order.Closing(true);
        this.SendData(SyncUtil_1.SyncUtil.OwnClosePacket(order.ticket, force, reason));
        main_1.ipcSend('sending-own-close', {
            account: this.Safecopy(),
            order: order,
            force: force,
            reason: reason
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
    TraderAccount.prototype.ForceCloseReasonForFailedSyncCopy = function (ticket) {
        return "Forcibly closed order #" + ticket + " because sync copy failed after maximum retry attempts of " + Constants_1.Constants.MAX_COPY_RETRY + ".";
    };
    TraderAccount.prototype.ForceCloseReasonForFailedOrderPlacement = function (ticket) {
        return "Forcibly closed order #" + ticket + " because sync order placement failed after maximum retry attempts of " + Constants_1.Constants.MAX_PLACE_ORDER_RETRY + ".";
    };
    TraderAccount.prototype.DefaultForceCloseReason = function (ticket) {
        return "Forcibly closed order #" + ticket + " because possibly sync copy or order placement failed";
    };
    TraderAccount.prototype.ForceCloseMe = function (ticket, reason) {
        if (reason === void 0) { reason = this.DefaultForceCloseReason(ticket); }
        var order = this.orders.get(ticket);
        if (order) {
            this.DoSendOwnClose(order, true, reason);
        }
    };
    TraderAccount.prototype.CloseAllTrades = function (event, comment) {
        var _this = this;
        if (event === void 0) { event = null; }
        if (comment === void 0) { comment = null; }
        var atleastOne = false;
        this.orders.forEach(function (order, ticket) {
            if (order.IsClosed() || order.IsClosing()) {
                return;
            }
            atleastOne = true;
            _this.DoSendOwnClose(order);
        });
        if (this.peer) {
            this.peer.orders.forEach(function (order, ticket) {
                if (order.IsClosed() || order.IsClosing()) {
                    return;
                }
                atleastOne = true;
                _this.DoSendOwnClose(order);
            });
        }
        if (atleastOne && event) {
            main_1.ipcSend(event, comment);
        }
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
    TraderAccount.prototype.RetrySendCopyOrForceCloseMe = function (origin_ticket) {
        var attempts = this.CopyRetryAttempt.get(origin_ticket);
        if (!attempts) {
            attempts = 0;
        }
        attempts++;
        if (attempts > Constants_1.Constants.MAX_COPY_RETRY) {
            var reason = this.ForceCloseReasonForFailedSyncCopy(origin_ticket);
            this.ForceCloseMe(origin_ticket, reason); //forcely close the order
            return;
        }
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
            if (!own_order.IsClosed() || own_order.IsClosing())
                continue;
            this.DoSendClose(own_order, peer_order);
        }
    };
    TraderAccount.prototype.SendCloseToGroup = function (ticket) {
        var orderObj = this.orders.get(ticket);
        var orders = this.Orders();
        for (var _i = 0, orders_4 = orders; _i < orders_4.length; _i++) {
            var order = orders_4[_i];
            if (orderObj.IsClosed()
                && orderObj.GropuId() === order.GropuId()
                && !order.IsClosed()
                && !order.IsClosing()) {
                this.DoSendOwnClose(order);
            }
        }
    };
    TraderAccount.prototype.RetrySendOwnClose = function (ticket) {
        var attempts = this.CloseRetryAttempt.get(ticket);
        if (!attempts) {
            attempts = 0;
        }
        if (attempts > Constants_1.Constants.MAX_CLOSE_RETRY)
            return;
        this.CloseRetryAttempt.set(ticket, attempts);
        var order = this.orders.get(ticket);
        this.DoSendOwnClose(order);
        SyncUtil_1.SyncUtil.LogOwnCloseRetry(this, ticket, attempts);
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
        var is_all_group_orders_open = false;
        for (var _i = 0, synced_orders_2 = synced_orders; _i < synced_orders_2.length; _i++) {
            var paired = synced_orders_2[_i];
            var own_column = this.PairColumnIndex();
            var peer_column = this.peer.PairColumnIndex();
            var own_order = paired[own_column];
            var peer_order = paired[peer_column];
            //Well before we  send modification we should ensure all the group orders
            //are open and not in closing state. We don't what the stoploss and target
            //to be modified when orders are being closed, it is pointless
            if (!is_all_group_orders_open) {
                is_all_group_orders_open = this.IsAllGroupOrdersOpenAnNotClosing(own_order, peer_order);
                if (!is_all_group_orders_open) {
                    return; //wait till all group orders are open
                }
            }
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