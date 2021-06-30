"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constants = void 0;
var Constants = /** @class */ (function () {
    function Constants() {
    }
    Constants.TAB = "\t";
    Constants.NEW_LINE = "\n";
    Constants.MAX_COPY_RETRY = 3;
    Constants.MAX_CLOSE_RETRY = 3;
    Constants.MAX_MODIFY_RETRY = 3;
    Constants.MAX_PLACE_ORDER_RETRY = Infinity; // yes infinity - only stop retry if the peer placement order is closed
    Constants.trade_condition_not_changed = "no error, trade conditions not changed";
    Constants.no_changes = "no changes";
    Constants.APPROX_ZERO_TOLERANCE = 0.000000001;
    Constants.IN_PROGRESS = 0;
    Constants.SUCCESS = 1;
    Constants.FAILED = 2;
    Constants.BUY = "BUY";
    Constants.SELL = "SELL";
    return Constants;
}());
exports.Constants = Constants;
//# sourceMappingURL=Constants.js.map