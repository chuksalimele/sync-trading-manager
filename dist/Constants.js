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
    Constants.MAX_PLACE_ORDER_RETRY = 3;
    Constants.APPROX_ZERO_TOLERANCE = 0.000000001;
    Constants.IN_PROGRESS = 0;
    Constants.SUCCESS = 1;
    Constants.FAILED = 2;
    Constants.VALIDATION_SUCCESS = 3;
    Constants.VALIDATION_FAIL = 4;
    Constants.BUY = "BUY";
    Constants.SELL = "SELL";
    Constants.Instant_when_both_accounts_have_credit_bonuses = 'Instant when both accounts have credit bonuses';
    Constants.Pending_at_price = 'Pending at price';
    Constants.Pending_at_price_when_both_accounts_have_credit_bonuses = 'Pending at price when both accounts have credit bonuses';
    //errors
    Constants.ERR_DUPLICATE_EA = "DUPLICATE EA";
    Constants.ERR_TRADE_CONDITION_NOT_CHANGED = "no error, trade conditions not changed";
    Constants.ERR_NO_CHANGES = "no changes";
    //commands
    Constants.CMD_DUPLICATE_EA = "duplicate_ea";
    Constants.CMD_CHECK_ENOUGH_MONEY = "check_enough_money";
    return Constants;
}());
exports.Constants = Constants;
//# sourceMappingURL=Constants.js.map