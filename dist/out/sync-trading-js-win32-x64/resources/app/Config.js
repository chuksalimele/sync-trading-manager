"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
var os = require('os');
var Config = /** @class */ (function () {
    function Config() {
    }
    Config.VERSION = '8.0.0';
    Config.APP_HOME_DIRECTORY = os.homedir() + "/.synctradingmanager";
    Config.PIPE_PATH = "\\\\.\\pipe\\sync_trades_pipe";
    Config.SYNC_LOG_FILE = Config.APP_HOME_DIRECTORY + "/log/sync_log.sync";
    Config.SYNC_ICON_FILE = Config.APP_HOME_DIRECTORY + "/ext/terminal_icons.sync";
    Config.APP_CONFIG_FILE = Config.APP_HOME_DIRECTORY + "/config.conf";
    Config.TERMINAL_ICON_NAME = "terminal";
    Config.TERMINAL_ICON_TYPE = ".ico";
    return Config;
}());
exports.Config = Config;
//# sourceMappingURL=Config.js.map