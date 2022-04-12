

var os = require('os');
var path = require('path');

export class Config {
    public static readonly VERSION: string = '10.0.0';
    static readonly APP_HOME_DIRECTORY: string = `${os.homedir()}/.synctradingmanager`;
    public static readonly PIPE_PATH: string = "\\\\.\\pipe\\sync_trades_pipe";
    public static readonly SYNC_LOG_FILE: string = Config.APP_HOME_DIRECTORY + "/log/sync_log.sync";
    public static readonly TEMP_DOWNLOAD_DEST_EX4: string = Config.APP_HOME_DIRECTORY + "/downloadEX4.temp";
    public static readonly TEMP_DOWNLOAD_DEST_EX5: string = Config.APP_HOME_DIRECTORY + "/downloadEX5.temp";
    public static readonly TEMP_STM_EXE_DEST: string = Config.APP_HOME_DIRECTORY + "/stm-setup.exe";
    public static readonly INSTALL_UPDATE_METADATA: string = Config.APP_HOME_DIRECTORY + "/metadata.json";
    
    
    public static readonly APP_CONFIG_FILE: string = Config.APP_HOME_DIRECTORY + "/config.conf";
    public static readonly TERMINAL_ICON_NAME: string = "terminal";
    public static readonly TERMINAL_ICON_TYPE: string = ".ico";   
    public static readonly USER_DATA_DIR: string =  process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share")
    public static readonly MT_ALL_TERMINALS_DATA_ROOT = Config.USER_DATA_DIR + path.sep +'MetaQuotes' + path.sep + 'Terminal';

    public static readonly MT4_EA_EXEC_FILE_SIMPLE_NAME: string = "SyncTradeClient.ex4";   
    public static readonly MT5_EA_EXEC_FILE_SIMPLE_NAME: string = "SyncTradeClient5.ex5";   
    

    /*public static readonly SYMBOLS_MAP_INITIAL_TXT = 
`DJz; US30; WS30; DJ30; WALLSTREET; DOWJONES; DowJones; WallStreet; 

XBRUSD; UKOIL; UKOUSD; BRENT;

XTIUSD; USOIL; USOUSD; WTI;

USDX; DOLLARINDEX; 

VIX; VIXINDEX;`;*/

}
