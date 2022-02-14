
import { App, fs, path, os, mkdirp } from "./app";
import { Order } from "./Order";
import { Config } from "./Config";
import { Constants } from "./Constants";
import { TraderAccount } from "./TraderAccount";
import { OrderPlacement } from "./OrderPlacement";


export class SyncUtil {

    private static InitUnique: string = (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2);
    private static CountSeq: number = 0;
    public static AppConfigMap: Map<string, any> = new Map<string, any>();
    private static MQL4: string = 'MQL4';
    private static MQL5: string = 'MQL5';

    /**
     * asynchronously delay a call to a function while a condition is true
     * and ignores the call to the function if another condition is true
     * @param fun 
     * @param wait_condition - keep waiting while this condition is true
     * @param stop_condition (optional)- just cancel and ignore the call to the function if this condition is true 
     */
    static WaitAsyncWhile(fun: Function, wait_condition: Function, stop_condition: Function = null) {
        if(stop_condition != null && stop_condition()){
            return;
        }
        
        if (wait_condition()) {
            setImmediate(this.WaitAsyncWhile.bind(this), fun, wait_condition, stop_condition);
        } else {                
            fun();                        
        }
    }
        
    public static GetEAPathsMQL4(lead_path: string, callback: Function):Array<string>{
        return this.GetEAPaths0(lead_path, this.MQL4, callback); 
    }

    public static GetEAPathsMQL5(lead_path: string, callback: Function):Array<string>{
        return this.GetEAPaths0(lead_path, this.MQL5, callback); 
    }

    public static GetEAPaths(lead_path: string, callback: Function):Array<string>{
        return this.GetEAPaths0(lead_path, null, callback); 
    }

    private static GetEAPaths0(lead_path: string, mql: string, callback: Function):Array<string>{
        var required_files = [];
        var sep_index = lead_path.length;
        var pre_sep_index = lead_path.length;
        var sep_count_back = 0;
        var word = '';
        var terminal_dir = ''; //location of all the MT platforms

        for(var i=lead_path.length -1; i > -1; i--){
            var char = lead_path.charAt(i);
            if(char== path.sep ||
                ((os.platform() == 'win32' || os.platform() == 'win64')
                && (char =='\\' || char =='/') )){
                pre_sep_index = sep_index;
                sep_index = i;   
                sep_count_back++;
                
                word = lead_path.substring(sep_index+ 1, pre_sep_index).trim();     

                if(word == 'Terminal'){
                    terminal_dir = lead_path.substring(0, pre_sep_index).trim();     
                    break;
                }
                
            }

        }


        var that = this;

        fs.readdir(terminal_dir, (err, files) =>{
            if (err) {
                return callback(err);
            } 
            
            var try_dirs = [];

            files.forEach(function (file_name) {   

                var req_dir_ex4 =  terminal_dir + path.sep+
                                    file_name + path.sep+
                                    'MQL4' + path.sep+ 
                                    'Experts';
                                            
                var req_dir_ex5 =  terminal_dir + path.sep+
                                    file_name + path.sep+
                                    'MQL5' + path.sep+ 
                                    'Experts';
                
                                    try_dirs.push(req_dir_ex4);
                                    try_dirs.push(req_dir_ex5);
            });

            try_dirs.forEach(function (try_dir_name, index) {       

                var resultFn = function(exists){
                                    
                                    if(exists){
                                        var req_file = this ;
                                        var req_mql = SyncUtil.PathMQL(req_file);

                                        req_file = req_mql === SyncUtil.MQL4
                                        ? req_file + path.sep + Config.MT4_EA_EXEC_FILE_SIMPLE_NAME 
                                        : req_file + path.sep + Config.MT5_EA_EXEC_FILE_SIMPLE_NAME;

                                        if(!mql || mql === req_mql){
                                            required_files.push(req_file);        
                                        }
                                                                        
                                    }

                                    if(index == try_dirs.length -1){
                                        callback(null, required_files);
                                    }
                                }
                        
                var resultFnBind =  resultFn.bind(try_dir_name);           

                that.checkFileExists(try_dir_name)
                .then(resultFnBind)

            });
        });

        return; //todo
    }

    private static PathMQL(lead_path: string): string{
        var sep_index = -1;
        var pre_sep_index = -1;
        var sep_count_back = 0;
        var word = '';

        for(var i=lead_path.length -1; i > -1; i--){
            var char = lead_path.charAt(i);
            if(char== path.sep ||
                ((os.platform() == 'win32' || os.platform() == 'win64')
                && (char =='\\' || char =='/') )){
                pre_sep_index = sep_index;
                sep_index = i;   
                sep_count_back++;

                if(pre_sep_index> -1){
                    word = lead_path.substring(sep_index+ 1, pre_sep_index).trim();     
                    if(word == 'MQL4'){
                        return SyncUtil.MQL4;
                    }
                    if(word == 'MQL5'){
                        return SyncUtil.MQL5;
                    }
                }
            }

        }
        return null
    }

    private static IsPathMQL4(lead_path: string): boolean{
        return this.PathMQL(lead_path) === this.MQL4
    }

    private static IsPathMQL5(lead_path: string): boolean{
        return this.PathMQL(lead_path) === this.MQL5
    }

    static checkFileExists(filepath){
        return new Promise((resolve, reject) => {
            fs.access(filepath, fs.constants.F_OK, error => {
            resolve(!error);
            });
        });
    }

    static Unique(): string {
        return "" + (++this.CountSeq) + this.InitUnique;
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

    public static SymbolSpread(broker: string, account_number: string, symbol: string, symbol_point: number): number {
        var general_symbol = SyncUtil.GeneralSymbol(broker, account_number, symbol);
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

    public static GeneralSymbol(broker: string, account_number: string, symbol: string): string {
        var symbol_config: Map<string, any> = this.AppConfigMap.get('symbol');
        if (symbol_config) {
            for (var general_symbol in symbol_config) {
                var broker_relative_symbol = symbol_config[general_symbol][broker]?.[account_number]?.['symbol'];

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

    public static UnpairedNotificationPacket(peer_broker: string, peer_account_number: string) {
        return `peer_broker=${peer_broker}${Constants.TAB}`
        +`peer_account_number=${peer_account_number}${Constants.TAB}`
        +`action=unpaired_notification`;
    }

    public static CommandPacket(command: string, command_id: string, prop: object){
        var packet = "";
        for(var n in prop){
            packet +=`${n}=${prop[n]}${Constants.TAB}`
        }
        return`${packet}command_id=${command_id}${Constants.TAB}command=${command}`;    
    }

    public static SyncPlackeOrderPacket(placement: OrderPlacement, broker: string, account_number: string) {
        return SyncUtil.PlackeOrderPacket(placement, broker, account_number, 'sync_place_order');
    }

    public static SyncPlackeValidateOrderPacket(placement: OrderPlacement, broker: string, account_number: string) {
        return SyncUtil.PlackeOrderPacket(placement, broker, account_number, 'sync_validate_place_order');       
    }

    public static PlackeOrderPacket(placement: OrderPlacement, broker: string, account_number:string, action: string) {
        return `uuid=` + placement.paired_uuid + Constants.TAB
            + `symbol=` + placement.symbol + Constants.TAB
            + `relative_symbol=` + SyncUtil.GetRelativeSymbol(placement.symbol, broker, account_number) + Constants.TAB
            + `position=` + placement.position + Constants.TAB
            + `lot_size=` + placement.lot_size + Constants.TAB
            + `action=` + action;
    }

    public static SyncCopyPacket(order: Order, 
        trade_copy_type: string, 
        broker: string, 
        account_number: string, 
        peer_broker: string, 
        peer_account_number: string): string {

        if (order.ticket == -1 &&
            order.position == undefined &&
            order.symbol == undefined
        ) {
            console.log("Why is this? Please resolve.");
        }

        //try for symbol and that of raw_symbol for whichever is configured
        var relative_symbol = SyncUtil.GetRelativePeerSymbol(order.symbol, peer_broker, peer_account_number, broker, account_number) 
                            || SyncUtil.GetRelativePeerSymbol(order.raw_symbol, peer_broker, peer_account_number, broker, account_number) 

        return `ticket=` + order.ticket + Constants.TAB
            + `position=` + order.position + Constants.TAB
            + `target=` + order.stoploss + Constants.TAB//yes, target becomes the stoploss of the sender - according to the strategy
            + `stoploss=` + order.target + Constants.TAB//yes, stoploss becomes the target of the sender - according to the strategy
            + `symbol=` + order.symbol + Constants.TAB
            + `raw_symbol=` + order.raw_symbol + Constants.TAB
            + `relative_symbol=` + relative_symbol + Constants.TAB
            + `lot_size=` + order.lot_size + Constants.TAB +
            `trade_copy_type=` + trade_copy_type + Constants.TAB + `action=sync_copy`;
    }

    public static SyncClosePacket(ticket: number, origin_ticket: number): string {
        return `ticket=` + ticket + Constants.TAB // the ticket to be closed
            + `origin_ticket=` + origin_ticket + Constants.TAB + `action=sync_close`;
    }

    public static OwnClosePacket(ticket: number, force: boolean, reason: string = ''): string {
        return `ticket=` + ticket + Constants.TAB // the ticket to be closed
             + `force=` + force + Constants.TAB
             + `reason=` + reason + Constants.TAB
             + `action=own_close`;
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

    public static GetRelativeSymbol(symbol: string, broker: string, account_number: string) {
        var symb_config: Map<string, any> = this.AppConfigMap.get('symbol');
        if (symb_config) {
            var rel_symbols = symb_config[symbol];
            if (rel_symbols) {
                var obj;                
                if (typeof rel_symbols[broker] === 'object'
                    && typeof (obj =rel_symbols[broker][account_number]) === 'object') {
                    return obj['symbol'];// using new configuration
                }
            }
        }

        return '';
    }

    public static GetRelativePeerSymbol(peer_symbol: string,
         peer_broker: string, 
         peer_account_number: string, 
         broker: string,
          account_number: string) {
        
        var symb_config = this.AppConfigMap.get('symbol');
       
        if(!symb_config){
            return '';
        }
        
        for(var n in symb_config){
            var sc = symb_config[n];
            var obj;                
                if (typeof sc[peer_broker] === 'object'
                    && typeof (obj =sc[peer_broker][peer_account_number]) === 'object'
                    && obj['symbol'] === peer_symbol) {
                    
                    if (typeof sc[broker] === 'object'
                        && typeof (obj =sc[broker][account_number]) === 'object') {                        
                            return obj['symbol'];        
                        }       

                }
        }

        return '';
    }

    public static GetAllowableEntrySpread(symbol: string, broker: string, account_number: string) {
        var symb_config: Map<string, any> = this.AppConfigMap.get('symbol');
        if (symb_config) {
            var allowable_entry_spread = symb_config[symbol];
            if (allowable_entry_spread) {
                var obj;
                if (typeof allowable_entry_spread[broker] === 'object' 
                        && (obj = allowable_entry_spread[broker][account_number]) === 'object') {
                    return obj['allowable_entry_spread'];// using new configuration
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

    static LogOwnCloseRetry(account: TraderAccount, ticket: number, attempts: number) {
        var final: string = attempts >= Constants.MAX_CLOSE_RETRY ? "FINAL " : "";
        console.log(`[${attempts}] ${final}CLOSE RETRY : Sending close of #${ticket} from [${account.Broker()}, ${account.AccountNumber()}]`);
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