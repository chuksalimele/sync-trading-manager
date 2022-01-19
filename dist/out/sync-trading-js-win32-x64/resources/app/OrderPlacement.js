"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderPlacement = void 0;
var Constants_1 = require("./Constants");
var SyncUtil_1 = require("./SyncUtil");
var OrderPlacement = /** @class */ (function () {
    function OrderPlacement(uuid, symbol, position, lot_size, trade_split_group_id, trade_split_count, is_triggered) {
        if (is_triggered === void 0) { is_triggered = false; }
        this.id = SyncUtil_1.SyncUtil.Unique();
        this.trade_split_count = 0;
        this.lot_size = 0;
        this.spread_cost = 0;
        this.required_margin = 0;
        this.state = Constants_1.Constants.IN_PROGRESS;
        this.is_triggered = false;
        this.operation_complete_status = 0;
        this.paired_uuid = uuid;
        this.symbol = symbol;
        this.position = position;
        this.lot_size = lot_size;
        this.trade_split_group_id = trade_split_group_id;
        this.trade_split_count = trade_split_count;
        this.is_triggered = is_triggered;
    }
    OrderPlacement.prototype.SetValidateResult = function (valid, validationMsg) {
        this.state = valid ? Constants_1.Constants.VALIDATION_SUCCESS : Constants_1.Constants.VALIDATION_FAIL;
    };
    OrderPlacement.prototype.SetResult = function (ticket) {
        this.state = ticket > -1 ? Constants_1.Constants.SUCCESS : Constants_1.Constants.FAILED;
        this.ticket = ticket;
    };
    OrderPlacement.prototype.SetSpreadCost = function (spread_cost) {
        this.spread_cost = spread_cost;
    };
    OrderPlacement.prototype.SetRequiredMargin = function (required_margin) {
        this.required_margin = required_margin;
    };
    OrderPlacement.prototype.SetOperationCompleteStatus = function (operation_complete) {
        this.operation_complete_status = operation_complete;
    };
    OrderPlacement.prototype.OperationCompleteStatus = function () {
        return this.operation_complete_status;
    };
    OrderPlacement.COMPLETE_FAIL = 1;
    OrderPlacement.COMPLETE_SUCCESS = 2;
    return OrderPlacement;
}());
exports.OrderPlacement = OrderPlacement;
//# sourceMappingURL=OrderPlacement.js.map