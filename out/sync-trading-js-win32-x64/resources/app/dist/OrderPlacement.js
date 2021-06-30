"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderPlacement = void 0;
var Constants_1 = require("./Constants");
var SyncUtil_1 = require("./SyncUtil");
var OrderPlacement = /** @class */ (function () {
    function OrderPlacement(uuid, symbol, position, lot_size) {
        this.id = SyncUtil_1.SyncUtil.Unique();
        this.state = Constants_1.Constants.IN_PROGRESS;
        this.paired_uuid = uuid;
        this.symbol = symbol;
        this.position = position;
        this.lot_size = lot_size;
    }
    OrderPlacement.prototype.SetResult = function (ticket) {
        this.state = ticket > -1 ? Constants_1.Constants.SUCCESS : Constants_1.Constants.FAILED;
        this.ticket = ticket;
    };
    return OrderPlacement;
}());
exports.OrderPlacement = OrderPlacement;
//# sourceMappingURL=OrderPlacement.js.map