
export class Constants {
    
    public static readonly TAB: string = "\t";
    public static readonly NEW_LINE: string = "\n";

    public static readonly MAX_COPY_RETRY: number = 3;
    public static readonly MAX_CLOSE_RETRY: number = 3;
    public static readonly MAX_MODIFY_RETRY: number = 3;
    public static readonly MAX_PLACE_ORDER_RETRY: number = Infinity; // yes infinity - only stop retry if the peer placement order is closed
    
    public static readonly trade_condition_not_changed: string = "no error, trade conditions not changed";

    public static readonly no_changes: string = "no changes";
    
    public static readonly APPROX_ZERO_TOLERANCE: number = 0.000000001;

    public static readonly IN_PROGRESS: number = 0;
    public static readonly SUCCESS: number = 1;
    public static readonly FAILED: number = 2;

    public static readonly BUY : string = "BUY";
    public static readonly SELL : string = "SELL";
}
