"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncUtil = void 0;
var app_1 = require("./app");
var Config_1 = require("./Config");
var Constants_1 = require("./Constants");
var SyncUtil = /** @class */ (function () {
    function SyncUtil() {
    }
    SyncUtil.Unique = function () {
        return "" + this.CountSeq + this.InitUnique;
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
    SyncUtil.SymbolSpread = function (broker, symbol, symbol_point) {
        var general_symbol = SyncUtil.GeneralSymbol(broker, symbol);
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
    SyncUtil.GeneralSymbol = function (broker, symbol) {
        var symbol_config = this.AppConfigMap.get('symbol');
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
    SyncUtil.SyncPlackeOrderPacket = function (placement, broker) {
        return "uuid=" + placement.paired_uuid + Constants_1.Constants.TAB
            + "symbol=" + placement.symbol + Constants_1.Constants.TAB
            + "relative_symbol=" + SyncUtil.GetRelativeSymbol(placement.symbol, broker) + Constants_1.Constants.TAB
            + "position=" + placement.position + Constants_1.Constants.TAB
            + "lot_size=" + placement.lot_size + Constants_1.Constants.TAB
            + "action=sync_place_order";
    };
    SyncUtil.SyncCopyPacket = function (order, trade_copy_type, broker) {
        if (order.ticket == -1 &&
            order.position == undefined &&
            order.symbol == undefined) {
            console.log("Why is this? Please resolve.");
        }
        return "ticket=" + order.ticket + Constants_1.Constants.TAB
            + "position=" + order.position + Constants_1.Constants.TAB
            + "target=" + order.stoploss + Constants_1.Constants.TAB //yes, target becomes the stoploss of the sender - according to the strategy
            + "stoploss=" + order.target + Constants_1.Constants.TAB //yes, stoploss becomes the target of the sender - according to the strategy
            + "symbol=" + order.symbol + Constants_1.Constants.TAB
            + "raw_symbol=" + order.raw_symbol + Constants_1.Constants.TAB
            + "relative_symbol=" + SyncUtil.GetRelativeSymbol(order.symbol, broker) + Constants_1.Constants.TAB
            + "lot_size=" + order.lot_size + Constants_1.Constants.TAB +
            "trade_copy_type=" + trade_copy_type + Constants_1.Constants.TAB + "action=sync_copy";
    };
    SyncUtil.SyncClosePacket = function (ticket, origin_ticket) {
        return "ticket=" + ticket + Constants_1.Constants.TAB // the ticket to be closed
            + "origin_ticket=" + origin_ticket + Constants_1.Constants.TAB + "action=sync_close";
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
    SyncUtil.GetRelativeSymbol = function (symbol, broker) {
        var symb_config = this.AppConfigMap.get('symbol');
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
    return SyncUtil;
}());
exports.SyncUtil = SyncUtil;
//# sourceMappingURL=SyncUtil.js.map