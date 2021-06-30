
import { SyncUtil } from "./SyncUtil";
import { TraderAccount } from "./TraderAccount";



export class PlaceOrderTrigger {

    public uuid: string = '';
    public is_triggered: boolean = false;
    public type: string = '';
    public pivot_price: number = 0;//this is the price at creation or modification of this triger. if the current price crossed above or below this pivot there will be a trigger
    public price: number = 0;
    public symbol: string = '';
    public buy_trader: TraderAccount
    public max_percent_diff_in_account_balances: number = 0;
    public buy_lot_size: number = 0;
    public sell_lot_size: number = 0;
    public pair_id: string = '';//use this to verify if the account are still pair together
    public remark: string = '';

    constructor() {
        this.uuid = SyncUtil.Unique();
    }
    /**
     * This method must be used to verify whether the current pairing is same with
     * as at the time of creating this trigger
     **/
    public VerifyPair(): boolean {
        return this.buy_trader && this.buy_trader.Peer() && this.buy_trader.PairID() == this.pair_id
    }
    
    public IsPriceTrigger(): boolean {
        return (this.pivot_price <= this.price && this.buy_trader.ChartMarketPrice() >= this.price)
            || (this.pivot_price >= this.price && this.buy_trader.ChartMarketPrice() <= this.price)
    }

    public IsBothAccountsHaveCredits() {
        return this.buy_trader.AccountCredit() > 0 && this.buy_trader.Peer() && this.buy_trader.Peer().AccountCredit() > 0
    }

    public IsAccountBalanceDifferenceAllowed() {

        if (!this.buy_trader.Peer()) return false;

        if (this.buy_trader.AccountBalance() <= 0) return false;

        if (this.buy_trader.Peer().AccountBalance() <= 0) return false;

        var percent_diff = Math.abs(this.buy_trader.AccountBalance() - this.buy_trader.Peer().AccountBalance()) / this.buy_trader.AccountBalance() * 100;

        return percent_diff <= this.max_percent_diff_in_account_balances;
    }

    Safecopy(): any {
        return {
            uuid: this.uuid,
            type: this.type,
            pivot_price: this.pivot_price,//this is the price at creation or modification of this triger. if the current price crossed above or below this pivot there will be a trigger
            price: this.price,
            symbol: this.symbol,
            buy_trader: this.buy_trader.Safecopy(),
            max_percent_diff_in_account_balances: this.max_percent_diff_in_account_balances,
            buy_lot_size: this.buy_lot_size,
            sell_lot_size: this.sell_lot_size,
            pair_id: this.pair_id,//use this to verify if the account are still pair together
            remark: this.remark
        }
    }

}