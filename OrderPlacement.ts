import { Constants } from "./Constants";
import { SyncUtil } from "./SyncUtil";


export class OrderPlacement {
    
    public id: string = SyncUtil.Unique();
    public paired_uuid: string;
    public ticket: number;
    public symbol: string;
    public position: string;
    public lot_size: number = 0;
    public spread_cost: number = 0;
    public required_margin: number = 0;
    public state: number = Constants.IN_PROGRESS;
    public is_triggered: boolean = false;
    private operation_complete_status: number = 0;
    public static readonly COMPLETE_FAIL: number = 1;
    public static readonly COMPLETE_SUCCESS: number = 2;

    constructor(uuid: string, symbol: string, position: string, lot_size: number, is_triggered: boolean = false) {
        this.paired_uuid = uuid;
        this.symbol = symbol;
        this.position = position;
        this.lot_size = lot_size;
        this.is_triggered = is_triggered;
    }

    public SetValidateResult(valid: boolean, validationMsg: string) {
        this.state = valid ? Constants.VALIDATION_SUCCESS : Constants.VALIDATION_FAIL;
    }

    public SetResult(ticket: number) {
        this.state = ticket > -1 ? Constants.SUCCESS : Constants.FAILED;
        this.ticket = ticket;
    }

    public SetSpreadCost(spread_cost: number) {
        this.spread_cost = spread_cost;
    }

    public SetRequiredMargin(required_margin: number) {
        this.required_margin = required_margin;
    }

    public SetOperationCompleteStatus(operation_complete: number) {
        this.operation_complete_status = operation_complete;
    }

    public OperationCompleteStatus() {
        return this.operation_complete_status;
    }

}