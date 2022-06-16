"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Order = void 0;
var SyncUtil_1 = require("./SyncUtil");
var Order = /** @class */ (function () {
    function Order(bit_order) {
        this.peer_ticket = -1; //greater than -1 if it is synced
        this.group_order_count = 0;
        this.open_price = 0;
        this.open_time = 0;
        this.stoploss = 0;
        this.target = 0;
        this.close_price = 0;
        this.close_time = 0;
        this.lot_size = 0;
        this.point = 0;
        this.stoploss_change_time = 0;
        this.target_change_time = 0;
        this.copy_signal_time = 0;
        this.close_signal_time = 0;
        this.modify_target_signal_time = 0;
        this.modify_stoploss_signal_time = 0;
        this.copy_execution_time = 0;
        this.close_execution_time = 0;
        this.modify_target_execution_time = 0;
        this.modify_stoploss_execution_time = 0;
        this.force = false; //force close or a forced operation
        this.reason = ''; // reason for the last forced operation
        this.is_lock_in_profit = false;
        this.default_spread = 0;
        this.spread = 0; //do not call this directly
        this.is_sync_copying = false;
        this.is_closing = false;
        this.is_sync_modifying_target = false;
        this.is_sync_modifying_stoploss = false;
        this.is_copyable = true;
        this.ticket = bit_order.ticket;
        this.group_id = bit_order.group_id;
        this.group_order_count = bit_order.group_order_count;
    }
    Order.prototype.snap = function () {
        return {
            ticket: this.ticket,
            group_id: this.group_id,
            group_order_count: this.group_order_count
        };
    };
    Order.prototype.GropuId = function () { return this.group_id; };
    Order.prototype.GroupOrderCount = function () { return this.group_order_count; };
    Order.prototype.IsOpen = function () { return this.open_time > 0 && this.close_time == 0; };
    Order.prototype.IsClosed = function () { return this.close_time > 0; };
    ;
    Order.prototype.SyncCopying = function (copying) { return this.is_sync_copying = copying; };
    ;
    /**
     * Sync or own closing
     * @param closing
     */
    Order.prototype.Closing = function (closing) { return this.is_closing = closing; };
    ;
    Order.prototype.SyncModifyingTarget = function (modifying_target) { return this.is_sync_modifying_target = modifying_target; };
    ;
    Order.prototype.SyncModifyingStoploss = function (modifying_stoploss) { return this.is_sync_modifying_stoploss = modifying_stoploss; };
    ;
    Order.prototype.IsSyncCopying = function () { return this.is_sync_copying; };
    ;
    /**
     * Sync or own closing
     */
    Order.prototype.IsClosing = function () { return this.is_closing; };
    ;
    Order.prototype.IsSyncModifyingTarget = function () { return this.is_sync_modifying_target; };
    ;
    Order.prototype.IsSyncModifyingStoploss = function () { return this.is_sync_modifying_stoploss; };
    ;
    Order.prototype.SetCopyable = function (copyable) { this.is_copyable = copyable; };
    Order.prototype.IsCopyable = function () { return this.is_copyable; };
    ;
    Order.prototype.IsLockInProfit = function () { return this.is_lock_in_profit; };
    ;
    Order.prototype.SetDefaultSpread = function (default_spread) { this.default_spread = default_spread; };
    Order.prototype.Spread = function (broker, account_number) {
        this.spread = SyncUtil_1.SyncUtil.SymbolSpread(broker, account_number, this.raw_symbol, this.point);
        return this.spread > 0 ? this.spread : this.default_spread;
    };
    Order.prototype.SetGroupId = function (trade_split_group_id) {
        this.group_id = trade_split_group_id;
    };
    Order.prototype.SetGroupOderCount = function (group_order_count) {
        this.group_order_count = group_order_count;
    };
    return Order;
}());
exports.Order = Order;
//# sourceMappingURL=Order.js.map