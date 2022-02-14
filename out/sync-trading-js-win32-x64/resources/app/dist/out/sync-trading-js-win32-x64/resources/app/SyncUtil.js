"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncUtil = void 0;
var app_1 = require("./app");
var Config_1 = require("./Config");
var Constants_1 = require("./Constants");
var SyncUtil = /** @class */ (function () {
    function SyncUtil() {
    }
    /**
     * asynchronously delay a call to a function while a condition is true
     * and ignores the call to the function if another condition is true
     * @param fun
     * @param wait_condition - keep waiting while this condition is true
     * @param stop_condition (optional)- just cancel and ignore the call to the function if this condition is true
     */
    SyncUtil.WaitAsyncWhile = function (fun, wait_condition, stop_condition) {
        if (stop_condition === void 0) { stop_condition = null; }
        if (stop_condition != null && stop_condition()) {
            return;
        }
        if (wait_condition()) {
            setImmediate(this.WaitAsyncWhile.bind(this), fun, wait_condition, stop_condition);
        }
        else {
            fun();
        }
    };
    SyncUtil.GetEAPathsMQL4 = function (lead_path, callback) {
        return this.GetEAPaths0(lead_path, this.MQL4, callback);
    };
    SyncUtil.GetEAPathsMQL5 = function (lead_path, callback) {
        return this.GetEAPaths0(lead_path, this.MQL5, callback);
    };
    SyncUtil.GetEAPaths = function (lead_path, callback) {
        return this.GetEAPaths0(lead_path, null, callback);
    };
    SyncUtil.GetEAPaths0 = function (lead_path, mql, callback) {
        var required_files = [];
        var sep_index = lead_path.length;
        var pre_sep_index = lead_path.length;
        var sep_count_back = 0;
        var word = '';
        var terminal_dir = ''; //location of all the MT platforms
        for (var i = lead_path.length - 1; i > -1; i--) {
            var char = lead_path.charAt(i);
            if (char == app_1.path.sep ||
                ((app_1.os.platform() == 'win32' || app_1.os.platform() == 'win64')
                    && (char == '\\' || char == '/'))) {
                pre_sep_index = sep_index;
                sep_index = i;
                sep_count_back++;
                word = lead_path.substring(sep_index + 1, pre_sep_index).trim();
                if (word == 'Terminal') {
                    terminal_dir = lead_path.substring(0, pre_sep_index).trim();
                    break;
                }
            }
        }
        var that = this;
        app_1.fs.readdir(terminal_dir, function (err, files) {
            if (err) {
                return callback(err);
            }
            var try_dirs = [];
            files.forEach(function (file_name) {
                var req_dir_ex4 = terminal_dir + app_1.path.sep +
                    file_name + app_1.path.sep +
                    'MQL4' + app_1.path.sep +
                    'Experts';
                var req_dir_ex5 = terminal_dir + app_1.path.sep +
                    file_name + app_1.path.sep +
                    'MQL5' + app_1.path.sep +
                    'Experts';
                try_dirs.push(req_dir_ex4);
                try_dirs.push(req_dir_ex5);
            });
            try_dirs.forEach(function (try_dir_name, index) {
                var resultFn = function (exists) {
                    if (exists) {
                        var req_file = this;
                        var req_mql = SyncUtil.PathMQL(req_file);
                        req_file = req_mql === SyncUtil.MQL4
                            ? req_file + app_1.path.sep + Config_1.Config.MT4_EA_EXEC_FILE_SIMPLE_NAME
                            : req_file + app_1.path.sep + Config_1.Config.MT5_EA_EXEC_FILE_SIMPLE_NAME;
                        if (!mql || mql === req_mql) {
                            required_files.push(req_file);
                        }
                    }
                    if (index == try_dirs.length - 1) {
                        callback(null, required_files);
                    }
                };
                var resultFnBind = resultFn.bind(try_dir_name);
                that.checkFileExists(try_dir_name)
                    .then(resultFnBind);
            });
        });
        return; //todo
    };
    SyncUtil.PathMQL = function (lead_path) {
        var sep_index = -1;
        var pre_sep_index = -1;
        var sep_count_back = 0;
        var word = '';
        for (var i = lead_path.length - 1; i > -1; i--) {
            var char = lead_path.charAt(i);
            if (char == app_1.path.sep ||
                ((app_1.os.platform() == 'win32' || app_1.os.platform() == 'win64')
                    && (char == '\\' || char == '/'))) {
                pre_sep_index = sep_index;
                sep_index = i;
                sep_count_back++;
                if (pre_sep_index > -1) {
                    word = lead_path.substring(sep_index + 1, pre_sep_index).trim();
                    if (word == 'MQL4') {
                        return SyncUtil.MQL4;
                    }
                    if (word == 'MQL5') {
                        return SyncUtil.MQL5;
                    }
                }
            }
        }
        return null;
    };
    SyncUtil.IsPathMQL4 = function (lead_path) {
        return this.PathMQL(lead_path) === this.MQL4;
    };
    SyncUtil.IsPathMQL5 = function (lead_path) {
        return this.PathMQL(lead_path) === this.MQL5;
    };
    SyncUtil.checkFileExists = function (filepath) {
        return new Promise(function (resolve, reject) {
            app_1.fs.access(filepath, app_1.fs.constants.F_OK, function (error) {
                resolve(!error);
            });
        });
    };
    SyncUtil.Unique = function () {
        return "" + (++this.CountSeq) + this.InitUnique;
    };
    SyncUtil.IsApproxZero = function (num) {
        return Math.abs(num) < Constants_1.Constants.APPROX_ZERO_TOLERANCE;
    };
    SyncUtil.ArrayRemove = function (arr, element) {
        var objIndex = arr.findIndex(function (obj) { return obj === element; });
        if (objIndex > -1) {
            arr.splice(objIndex, 1);
        }
    };
    SyncUtil.MapToObject = function (map) {
        var obj = {};
        map.forEach(function (value, key) {
            obj[key] = value;
        });
        return obj;
    };
    SyncUtil.replaceAll = function (name, search, replacement) {
        while (true) {
            var d_name = name;
            d_name = d_name.replace(search, replacement);
            if (d_name == name) {
                break;
            }
            name = d_name;
        }
        return name;
    };
    SyncUtil.SymbolSpread = function (broker, account_number, symbol, symbol_point) {
        var general_symbol = SyncUtil.GeneralSymbol(broker, account_number, symbol);
        if (general_symbol) {
            var spread_config = this.AppConfigMap.get('spread');
            if (spread_config) {
                var spread_digit = spread_config[general_symbol] - 0; //implicitly convert to number
                if (spread_digit > 0) {
                    return spread_digit * symbol_point;
                }
            }
        }
        return 0;
    };
    SyncUtil.GeneralSymbol = function (broker, account_number, symbol) {
        var _a, _b;
        var symbol_config = this.AppConfigMap.get('symbol');
        if (symbol_config) {
            for (var general_symbol in symbol_config) {
                var broker_relative_symbol = (_b = (_a = symbol_config[general_symbol][broker]) === null || _a === void 0 ? void 0 : _a[account_number]) === null || _b === void 0 ? void 0 : _b['symbol'];
                var symbol_no_slash = SyncUtil.replaceAll(symbol, '/', '');
                if (broker_relative_symbol == symbol || broker_relative_symbol == symbol_no_slash) {
                    return general_symbol;
                }
            }
        }
        return '';
    };
    SyncUtil.SaveAppConfig = function (json, callback) {
        var that = this;
        //overwrite the file content
        app_1.fs.writeFile(Config_1.Config.APP_CONFIG_FILE, JSON.stringify(json), { encoding: 'utf8', flag: 'w' }, function (err) {
            if (err) {
                return console.log(err);
                callback(false);
            }
            else {
                that.AppConfigMap = new Map(Object.entries(json));
                callback(true);
            }
        });
    };
    SyncUtil.LoadAappConfig = function () {
        var file = Config_1.Config.APP_CONFIG_FILE;
        var dirname = app_1.path.dirname(file);
        if (!app_1.fs.existsSync(dirname)) {
            app_1.mkdirp.sync(dirname);
        }
        var fd = app_1.fs.openSync(file, 'a+'); //open for reading and appending
        var stats = app_1.fs.statSync(file);
        var size = stats['size'];
        var buffer = Buffer.alloc(size);
        app_1.fs.readSync(fd, buffer, 0, size, null);
        var data = buffer.toString(); //toString(0, length) did not work but toString() worked for me
        try {
            this.AppConfigMap = new Map(Object.entries(JSON.parse(data)));
        }
        catch (e) {
            console.error(e);
        }
    };
    SyncUtil.UnpairedNotificationPacket = function (peer_broker, peer_account_number) {
        return "peer_broker=" + peer_broker + Constants_1.Constants.TAB
            + ("peer_account_number=" + peer_account_number + Constants_1.Constants.TAB)
            + "action=unpaired_notification";
    };
    SyncUtil.CommandPacket = function (command, command_id, prop) {
        var packet = "";
        for (var n in prop) {
            packet += n + "=" + prop[n] + Constants_1.Constants.TAB;
        }
        return packet + "command_id=" + command_id + Constants_1.Constants.TAB + "command=" + command;
    };
    SyncUtil.SyncPlackeOrderPacket = function (placement, broker, account_number) {
        return SyncUtil.PlackeOrderPacket(placement, broker, account_number, 'sync_place_order');
    };
    SyncUtil.SyncPlackeValidateOrderPacket = function (placement, broker, account_number) {
        return SyncUtil.PlackeOrderPacket(placement, broker, account_number, 'sync_validate_place_order');
    };
    SyncUtil.PlackeOrderPacket = function (placement, broker, account_number, action) {
        return "uuid=" + placement.paired_uuid + Constants_1.Constants.TAB
            + "symbol=" + placement.symbol + Constants_1.Constants.TAB
            + "relative_symbol=" + SyncUtil.GetRelativeSymbol(placement.symbol, broker, account_number) + Constants_1.Constants.TAB
            + "position=" + placement.position + Constants_1.Constants.TAB
            + "lot_size=" + placement.lot_size + Constants_1.Constants.TAB
            + "action=" + action;
    };
    SyncUtil.SyncCopyPacket = function (order, trade_copy_type, broker, account_number, peer_broker, peer_account_number) {
        if (order.ticket == -1 &&
            order.position == undefined &&
            order.symbol == undefined) {
            console.log("Why is this? Please resolve.");
        }
        //try for symbol and that of raw_symbol for whichever is configured
        var relative_symbol = SyncUtil.GetRelativePeerSymbol(order.symbol, peer_broker, peer_account_number, broker, account_number)
            || SyncUtil.GetRelativePeerSymbol(order.raw_symbol, peer_broker, peer_account_number, broker, account_number);
        return "ticket=" + order.ticket + Constants_1.Constants.TAB
            + "position=" + order.position + Constants_1.Constants.TAB
            + "target=" + order.stoploss + Constants_1.Constants.TAB //yes, target becomes the stoploss of the sender - according to the strategy
            + "stoploss=" + order.target + Constants_1.Constants.TAB //yes, stoploss becomes the target of the sender - according to the strategy
            + "symbol=" + order.symbol + Constants_1.Constants.TAB
            + "raw_symbol=" + order.raw_symbol + Constants_1.Constants.TAB
            + "relative_symbol=" + relative_symbol + Constants_1.Constants.TAB
            + "lot_size=" + order.lot_size + Constants_1.Constants.TAB +
            "trade_copy_type=" + trade_copy_type + Constants_1.Constants.TAB + "action=sync_copy";
    };
    SyncUtil.SyncClosePacket = function (ticket, origin_ticket) {
        return "ticket=" + ticket + Constants_1.Constants.TAB // the ticket to be closed
            + "origin_ticket=" + origin_ticket + Constants_1.Constants.TAB + "action=sync_close";
    };
    SyncUtil.OwnClosePacket = function (ticket, force, reason) {
        if (reason === void 0) { reason = ''; }
        return "ticket=" + ticket + Constants_1.Constants.TAB // the ticket to be closed
            + "force=" + force + Constants_1.Constants.TAB
            + "reason=" + reason + Constants_1.Constants.TAB
            + "action=own_close";
    };
    SyncUtil.SyncModifyTargetPacket = function (price, ticket, origin_ticket) {
        return "target=" + price + Constants_1.Constants.TAB
            + "ticket=" + ticket + Constants_1.Constants.TAB
            + "origin_ticket=" + origin_ticket + Constants_1.Constants.TAB
            + "action=sync_modify_target";
    };
    SyncUtil.SyncModifyStoplossPacket = function (price, ticket, origin_ticket) {
        return "stoploss=" + price + Constants_1.Constants.TAB
            + "ticket=" + ticket + Constants_1.Constants.TAB
            + "origin_ticket=" + origin_ticket + Constants_1.Constants.TAB
            + "action=sync_modify_stoploss";
    };
    SyncUtil.Intro = function () {
        return "action=intro";
    };
    SyncUtil.PingPacket = function () {
        return "ping=pong";
    };
    SyncUtil.GetRelativeSymbol = function (symbol, broker, account_number) {
        var symb_config = this.AppConfigMap.get('symbol');
        if (symb_config) {
            var rel_symbols = symb_config[symbol];
            if (rel_symbols) {
                var obj;
                if (typeof rel_symbols[broker] === 'object'
                    && typeof (obj = rel_symbols[broker][account_number]) === 'object') {
                    return obj['symbol']; // using new configuration
                }
            }
        }
        return '';
    };
    SyncUtil.GetRelativePeerSymbol = function (peer_symbol, peer_broker, peer_account_number, broker, account_number) {
        var symb_config = this.AppConfigMap.get('symbol');
        if (!symb_config) {
            return '';
        }
        for (var n in symb_config) {
            var sc = symb_config[n];
            var obj;
            if (typeof sc[peer_broker] === 'object'
                && typeof (obj = sc[peer_broker][peer_account_number]) === 'object'
                && obj['symbol'] === peer_symbol) {
                if (typeof sc[broker] === 'object'
                    && typeof (obj = sc[broker][account_number]) === 'object') {
                    return obj['symbol'];
                }
            }
        }
        return '';
    };
    SyncUtil.GetAllowableEntrySpread = function (symbol, broker, account_number) {
        var symb_config = this.AppConfigMap.get('symbol');
        if (symb_config) {
            var allowable_entry_spread = symb_config[symbol];
            if (allowable_entry_spread) {
                var obj;
                if (typeof allowable_entry_spread[broker] === 'object'
                    && (obj = allowable_entry_spread[broker][account_number]) === 'object') {
                    return obj['allowable_entry_spread']; // using new configuration
                }
            }
        }
        return '';
    };
    SyncUtil.NormalizeName = function (name) {
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
    };
    SyncUtil.LogPlaceOrderRetry = function (account, id, attempts) {
        var final = attempts >= Constants_1.Constants.MAX_PLACE_ORDER_RETRY ? "FINAL " : "";
        console.log("[" + attempts + "] " + final + "COYP RETRY : Sending place order to [" + account.Broker() + ", " + account.AccountNumber() + "] placement id " + id);
    };
    SyncUtil.LogCopyRetry = function (account, origin_ticket, attempts) {
        var final = attempts >= Constants_1.Constants.MAX_COPY_RETRY ? "FINAL " : "";
        console.log("[" + attempts + "] " + final + "COYP RETRY : Sending copy #" + origin_ticket + " from [" + account.Broker() + ", " + account.AccountNumber() + "] to [" + account.Peer().Broker() + ", " + account.Peer().AccountNumber() + "]");
    };
    SyncUtil.LogCloseRetry = function (account, origin_ticket, peer_ticket, attempts) {
        var final = attempts >= Constants_1.Constants.MAX_CLOSE_RETRY ? "FINAL " : "";
        console.log("[" + attempts + "] " + final + "CLOSE RETRY : Sending close of #" + origin_ticket + " to target #" + peer_ticket + " - from [" + account.Broker() + ", " + account.AccountNumber() + "] to [" + account.Peer().Broker() + ", " + account.Peer().AccountNumber() + "]");
    };
    SyncUtil.LogOwnCloseRetry = function (account, ticket, attempts) {
        var final = attempts >= Constants_1.Constants.MAX_CLOSE_RETRY ? "FINAL " : "";
        console.log("[" + attempts + "] " + final + "CLOSE RETRY : Sending close of #" + ticket + " from [" + account.Broker() + ", " + account.AccountNumber() + "]");
    };
    SyncUtil.LogModifyTargetRetry = function (account, origin_ticket, peer_ticket, attempts) {
        var final = attempts >= Constants_1.Constants.MAX_MODIFY_RETRY ? "FINAL " : "";
        console.log("[" + attempts + "] " + final + "MODIFY TARGET RETRY : Sending changed stoploss(" + origin_ticket + ")  of #" + origin_ticket + " to modify target price of #" + peer_ticket + " - from [" + account.Broker() + ", " + account.AccountNumber() + "] to [" + account.Peer().Broker() + ", " + account.Peer().AccountNumber() + "]");
    };
    SyncUtil.LogModifyStoplossRetry = function (account, origin_ticket, peer_ticket, attempts) {
        var final = attempts >= Constants_1.Constants.MAX_MODIFY_RETRY ? "FINAL " : "";
        console.log("[" + attempts + "] " + final + "MODIFY STOPLOSS RETRY : Sending changed target(" + origin_ticket + ")  of #" + origin_ticket + " to modify stoploss price of #" + peer_ticket + " - from [" + account.Broker() + ", " + account.AccountNumber() + "] to [" + account.Peer().Broker() + ", " + account.Peer().AccountNumber() + "]");
    };
    SyncUtil.InitUnique = (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2);
    SyncUtil.CountSeq = 0;
    SyncUtil.AppConfigMap = new Map();
    SyncUtil.MQL4 = 'MQL4';
    SyncUtil.MQL5 = 'MQL5';
    return SyncUtil;
}());
exports.SyncUtil = SyncUtil;
//# sourceMappingURL=SyncUtil.js.map