import { Constants } from "./Constants";
import { SyncUtil } from "./SyncUtil";


export class OrderPlacement {

    public id: string = SyncUtil.Unique();
    public paired_uuid: string;
    public ticket: number;
    public symbol: string;
    public position: string;
    public lot_size: number;
    public state: number = Constants.IN_PROGRESS;

    constructor(uuid: string, symbol: string, position: string, lot_size: number) {
        this.paired_uuid = uuid;
        this.symbol = symbol;
        this.position = position;
        this.lot_size = lot_size;
    }

    public SetResult(ticket: number) {
        this.state = ticket > -1 ? Constants.SUCCESS : Constants.FAILED;
        this.ticket = ticket;
    }

}