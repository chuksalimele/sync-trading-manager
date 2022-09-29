"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
var os = require('os');
var path = require('path');
var Config = /** @class */ (function () {
    function Config() {
    }
    Config.VERSION = '14.0.0';
    Config.APP_HOME_DIRECTORY = os.homedir() + "/.synctradingmanager";
    Config.PIPE_PATH = "\\\\.\\pipe\\sync_trades_pipe";
    Config.SYNC_LOG_FILE = Config.APP_HOME_DIRECTORY + "/log/sync_log.sync";
    Config.TEMP_DOWNLOAD_DEST_EX4 = Config.APP_HOME_DIRECTORY + "/downloadEX4.temp";
    Config.TEMP_DOWNLOAD_DEST_EX5 = Config.APP_HOME_DIRECTORY + "/downloadEX5.temp";
    Config.TEMP_STM_EXE_DEST = Config.APP_HOME_DIRECTORY + "/stm-setup.exe";
    Config.INSTALL_UPDATE_METADATA = Config.APP_HOME_DIRECTORY + "/metadata.json";
    Config.APP_CONFIG_FILE = Config.APP_HOME_DIRECTORY + "/config.conf";
    Config.TERMINAL_ICON_NAME = "terminal";
    Config.TERMINAL_ICON_TYPE = ".ico";
    Config.USER_DATA_DIR = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
    Config.MT_ALL_TERMINALS_DATA_ROOT = Config.USER_DATA_DIR + path.sep + 'MetaQuotes' + path.sep + 'Terminal';
    Config.MT4_EA_EXEC_FILE_SIMPLE_NAME = "SyncTradeClient.ex4";
    Config.MT5_EA_EXEC_FILE_SIMPLE_NAME = "SyncTradeClient5.ex5";
    //update this list for every update where the setting properties modification
    //is too dangerous to use needs to be replacement completely
    Config.LIST_OF_FILES_TO_CLEAR_IN_NEW_UPDATE = [
        Config.APP_CONFIG_FILE,
        Config.SYNC_LOG_FILE
    ];
    return Config;
}());
exports.Config = Config;
//# sourceMappingURL=Config.js.map