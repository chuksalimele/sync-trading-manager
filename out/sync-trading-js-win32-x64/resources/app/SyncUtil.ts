
import { App, fs, path, mkdirp } from "./app";
import { Order } from "./Order";
import { Config } from "./Config";
import { Constants } from "./Constants";
import { TraderAccount } from "./TraderAccount";
import { OrderPlacement } from "./OrderPlacement";


export class SyncUtil {

    private static InitUnique: string = (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2);
    private static CountSeq: number = 0;
    public static AppConfigMap: Map<string, any> = new Map<string, any>();


    static Unique(): string {
        return "" + this.CountSeq + this.InitUnique;
    }

    static IsApproxZero(num: number): boolean {
        return Math.abs(num) < Constants.APPROX_ZERO_TOLERANCE;
    }

    static ArrayRemove(arr: Array<unknown>, element: unknown) {
        const objIndex = arr.findIndex(obj => obj === element);
        if (objIndex > -1) {
            arr.splice(objIndex, 1);
        }
    }

    static MapToObject(map: Map<any, any>): any{
        let obj = {};
        map.forEach(function (value, key) {
            obj[key] = value;
        });

        return obj;
    }

    static replaceAll(name: string, search: string, replacement: string): string {

        while (true) {
            var d_name = name;

            d_name = d_name.replace(search, replacement);

            if (d_name == name) {
                break;
            }
            name = d_name;
        }

        return name;

    }

    public static SymbolSpread(broker: string, symbol: string, symbol_point: number): number {
        var general_symbol = SyncUtil.GeneralSymbol(broker, symbol);
        if (general_symbol) {
            var spread_config: Map<string, any> = this.AppConfigMap.get('spread');
            if (spread_config) {
                var spread_digit = spread_config[general_symbol] - 0; //implicitly convert to number
                if (spread_digit > 0) {
                    return spread_digit * symbol_point;
                }
            }
        }
        return 0;
    }

    public static GeneralSymbol(broker: string, symbol: string): string {
        var symbol_config: Map<string, any> = this.AppConfigMap.get('symbol');
        if (symbol_config) {
            for (var general_symbol in symbol_config) {
                var broker_relative_symbol = symbol_config[general_symbol][broker];

                var symbol_no_slash = SyncUtil.replaceAll(symbol, '/', '');

                if (broker_relative_symbol == symbol || broker_relative_symbol == symbol_no_slash) {
                    return general_symbol;
                }
            }
        }

        return '';
    }

    public static SaveAppConfig(json: any, callback: Function) {

        var that = this;

        //overwrite the file content
        fs.writeFile(Config.APP_CONFIG_FILE, JSON.stringify(json), { encoding: 'utf8', flag: 'w' }, function (err) {
            if (err) {
                return console.log(err);
                callback(false);
            } else {
                that.AppConfigMap = new Map<string, any>(Object.entries(json));
                callback(true);
            }
        })

    }
    
    static LoadAappConfig(): void {

        var file = Config.APP_CONFIG_FILE;
        var dirname = path.dirname(file);
        if (!fs.existsSync(dirname)) {
            mkdirp.sync(dirname);
        }
        var fd = fs.openSync(file, 'a+');//open for reading and appending

        var stats = fs.statSync(file);
        var size = stats['size'];
        var buffer = Buffer.alloc(size);


        fs.readSync(fd, buffer, 0, size, null);

        var data = buffer.toString(); //toString(0, length) did not work but toString() worked for me

        try {

            this.AppConfigMap = new Map(Object.entries(JSON.parse(data)));
           
        } catch (e) {
            console.error(e);
        }


    }


    public static SyncPlackeOrderPacket(placement: OrderPlacement, broker: string) {
        return `uuid=` + placement.paired_uuid + Constants.TAB 
            + `symbol=` + placement.symbol + Constants.TAB
            + `relative_symbol=` + SyncUtil.GetRelativeSymbol(placement.symbol, broker) + Constants.TAB
            + `position=` + placement.position + Constants.TAB
            + `lot_size=` + placement.lot_size + Constants.TAB
            + `action=sync_place_order`;
    }

    public static SyncCopyPacket(order: Order, trade_copy_type: string, broker: string): string {

        if (order.ticket == -1 &&
            order.position == undefined &&
            order.symbol == undefined
        ) {
            console.log("Why is this? Please resolve.");
        }



        return `ticket=` + order.ticket + Constants.TAB
            + `position=` + order.position + Constants.TAB
            + `target=` + order.stoploss + Constants.TAB//yes, target becomes the stoploss of the sender - according to the strategy
            + `stoploss=` + order.target + Constants.TAB//yes, stoploss becomes the target of the sender - according to the strategy
            + `symbol=` + order.symbol + Constants.TAB
            + `raw_symbol=` + order.raw_symbol + Constants.TAB
            + `relative_symbol=` + SyncUtil.GetRelativeSymbol(order.symbol, broker) + Constants.TAB
            + `lot_size=` + order.lot_size + Constants.TAB +
            `trade_copy_type=` + trade_copy_type + Constants.TAB + `action=sync_copy`;
    }

    public static SyncClosePacket(ticket: number, origin_ticket: number): string {
        return `ticket=` + ticket + Constants.TAB // the ticket to be closed
            + `origin_ticket=` + origin_ticket + Constants.TAB + `action=sync_close`;
    }

    public static SyncModifyTargetPacket(price: number, ticket: number, origin_ticket: number): string {
        return `target=` + price + Constants.TAB
            + `ticket=` + ticket + Constants.TAB
            + `origin_ticket=` + origin_ticket + Constants.TAB
            + `action=sync_modify_target`;
    }

    public static SyncModifyStoplossPacket(price: number, ticket: number, origin_ticket: number): string {
        return `stoploss=` + price + Constants.TAB
            + `ticket=` + ticket + Constants.TAB
            + `origin_ticket=` + origin_ticket + Constants.TAB
            + `action=sync_modify_stoploss`;
    }
    public static Intro(): string {
        return "action=intro"
    }
    public static PingPacket(): string {
        return "ping=pong"
    }

    public static GetRelativeSymbol(symbol: string, broker: string) {
        var symb_config: Map<string, any> = this.AppConfigMap.get('symbol');
        if (symb_config) {
            var rel_symbols = symb_config[symbol];
            if (rel_symbols) {
                var symb = rel_symbols[broker];
                if (symb) {
                    return symb;
                }
            }
        }

        return '';
    }

    public static NormalizeName(name: string): string {

        name = name.trim();

        var single_space = " ";
        var double_space = single_space + single_space;

        while (true) {
            var d_name = name;

            d_name = d_name.replace(double_space, single_space);
            d_name = d_name.replace(",", "");
            d_name = d_name.replace(".", "");

            if (d_name == name) {
                break;
            }
            name = d_name;
        }

        return name;
    }

    static LogPlaceOrderRetry(account: TraderAccount, id: string, attempts: number) {
        var final: string = attempts >= Constants.MAX_PLACE_ORDER_RETRY ? "FINAL " : "";
        console.log(`[${attempts}] ${final}COYP RETRY : Sending place order to [${account.Broker()}, ${account.AccountNumber()}] placement id ${id}`);
    }

    static LogCopyRetry(account: TraderAccount, origin_ticket: number, attempts: number) {
        var final: string = attempts >= Constants.MAX_COPY_RETRY ? "FINAL " : "";
        console.log(`[${attempts}] ${final}COYP RETRY : Sending copy #${origin_ticket} from [${account.Broker()}, ${account.AccountNumber()}] to [${account.Peer().Broker()}, ${account.Peer().AccountNumber()}]`);
    }

    static LogCloseRetry(account: TraderAccount, origin_ticket: number, peer_ticket: number, attempts: number) {
        var final: string = attempts >= Constants.MAX_CLOSE_RETRY ? "FINAL " : "";
        console.log(`[${attempts}] ${final}CLOSE RETRY : Sending close of #${origin_ticket} to target #${peer_ticket} - from [${account.Broker()}, ${account.AccountNumber()}] to [${account.Peer().Broker()}, ${account.Peer().AccountNumber()}]`);
    }

    static LogModifyTargetRetry(account: TraderAccount, origin_ticket: number, peer_ticket: number, attempts: number) {
        var final: string = attempts >= Constants.MAX_MODIFY_RETRY ? "FINAL " : "";
        console.log(`[${attempts}] ${final}MODIFY TARGET RETRY : Sending changed stoploss(${origin_ticket})  of #${origin_ticket} to modify target price of #${peer_ticket} - from [${account.Broker()}, ${account.AccountNumber()}] to [${account.Peer().Broker()}, ${account.Peer().AccountNumber()}]`);
    }

    static LogModifyStoplossRetry(account: TraderAccount, origin_ticket: number, peer_ticket: number, attempts: number) {
        var final: string = attempts >= Constants.MAX_MODIFY_RETRY ? "FINAL " : "";
        console.log(`[${attempts}] ${final}MODIFY STOPLOSS RETRY : Sending changed target(${origin_ticket})  of #${origin_ticket} to modify stoploss price of #${peer_ticket} - from [${account.Broker()}, ${account.AccountNumber()}] to [${account.Peer().Broker()}, ${account.Peer().AccountNumber()}]`);
    }
    
}