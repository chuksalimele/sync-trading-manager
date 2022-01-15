
var os = require('os');

export class Config {
    public static readonly VERSION: string = '6.0.0';
    static readonly APP_HOME_DIRECTORY: string = `${os.homedir()}/.synctradingmanager`;
    public static readonly PIPE_PATH: string = "\\\\.\\pipe\\sync_trades_pipe";
    public static readonly SYNC_LOG_FILE: string = Config.APP_HOME_DIRECTORY + "/log/sync_log.sync";
    public static readonly SYNC_ICON_FILE: string = Config.APP_HOME_DIRECTORY + "/ext/terminal_icons.sync";
   
    public static readonly APP_CONFIG_FILE: string = Config.APP_HOME_DIRECTORY + "/config.conf";
    public static readonly TERMINAL_ICON_NAME: string = "terminal";
    public static readonly TERMINAL_ICON_TYPE: string = ".ico";   

    /*public static readonly SYMBOLS_MAP_INITIAL_TXT = 
`DJz; US30; WS30; DJ30; WALLSTREET; DOWJONES; DowJones; WallStreet; 

XBRUSD; UKOIL; UKOUSD; BRENT;

XTIUSD; USOIL; USOUSD; WTI;

USDX; DOLLARINDEX; 

VIX; VIXINDEX;`;*/

}
