"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceOrderTrigger = void 0;
var SyncUtil_1 = require("./SyncUtil");
var PlaceOrderTrigger = /** @class */ (function () {
    function PlaceOrderTrigger() {
        this.uuid = '';
        this.is_triggered = false;
        this.type = '';
        this.pivot_price = 0; //this is the price at creation or modification of this triger. if the current price crossed above or below this pivot there will be a trigger
        this.price = 0;
        this.symbol = '';
        this.max_percent_diff_in_account_balances = 0;
        this.buy_lot_size = 0;
        this.sell_lot_size = 0;
        this.pair_id = ''; //use this to verify if the account are still pair together
        this.remark = '';
        this.uuid = SyncUtil_1.SyncUtil.Unique();
    }
    /**
     * This method must be used to verify whether the current pairing is same with
     * as at the time of creating this trigger
     **/
    PlaceOrderTrigger.prototype.VerifyPair = function () {
        return this.buy_trader && this.buy_trader.Peer() && this.buy_trader.PairID() == this.pair_id;
    };
    PlaceOrderTrigger.prototype.IsPriceTrigger = function () {
        return (this.pivot_price <= this.price && this.buy_trader.ChartMarketPrice() >= this.price)
            || (this.pivot_price >= this.price && this.buy_trader.ChartMarketPrice() <= this.price);
    };
    PlaceOrderTrigger.prototype.IsBothAccountsHaveCredits = function () {
        return this.buy_trader.AccountCredit() > 0 && this.buy_trader.Peer() && this.buy_trader.Peer().AccountCredit() > 0;
    };
    PlaceOrderTrigger.prototype.IsAccountBalanceDifferenceAllowed = function () {
        if (!this.buy_trader.Peer())
            return false;
        if (this.buy_trader.AccountBalance() <= 0)
            return false;
        if (this.buy_trader.Peer().AccountBalance() <= 0)
            return false;
        var percent_diff = Math.abs(this.buy_trader.AccountBalance() - this.buy_trader.Peer().AccountBalance()) / this.buy_trader.AccountBalance() * 100;
        return percent_diff <= this.max_percent_diff_in_account_balances;
    };
    PlaceOrderTrigger.prototype.Safecopy = function () {
        return {
            uuid: this.uuid,
            type: this.type,
            pivot_price: this.pivot_price,
            price: this.price,
            symbol: this.symbol,
            buy_trader: this.buy_trader.Safecopy(),
            max_percent_diff_in_account_balances: this.max_percent_diff_in_account_balances,
            buy_lot_size: this.buy_lot_size,
            sell_lot_size: this.sell_lot_size,
            pair_id: this.pair_id,
            remark: this.remark
        };
    };
    return PlaceOrderTrigger;
}());
exports.PlaceOrderTrigger = PlaceOrderTrigger;
//# sourceMappingURL=PlaceOrderTrigger.js.map