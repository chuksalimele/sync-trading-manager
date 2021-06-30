'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipcSend = void 0;
Object.defineProperty(exports, "__esModule", { value: true });
var app_1 = require("./app");
var SyncUtil_1 = require("./SyncUtil");
var _a = require('electron'), app = _a.app, ipcMain = _a.ipcMain, BrowserWindow = _a.BrowserWindow;
var win;
var mainApp = new app_1.App();
var ipcSend = function (event, data) {
    win.webContents.send(event, data);
};
exports.ipcSend = ipcSend;
Main();
function Main() {
    //The easiest way to handle these arguments and stop your app launching multiple times
    //during install is to use electron - squirrel - startup as one of the first things your app does
    if (require('electron-squirrel-startup')) { //come back to verify this!!!
        app.quit();
        return;
    }
    function createWindow() {
        win = new BrowserWindow({
            width: 1300,
            height: 750,
            title: 'Sync Trading Manager',
            webPreferences: {
                nodeIntegration: true
            }
        });
        // and load the index.html of the app. 
        win.loadFile(__dirname + "/../index.html");
        win.removeMenu(); //remove the default menu
        // Open the DevTools. 
        win.webContents.openDevTools(); //UNCOMMENT IN PRODUCTION TO HIDE DEBUGGER VIEW
        //Quit app when main BrowserWindow Instance is closed
        win.on('closed', function () {
            app.quit();
        });
    }
    // This method will be called when the Electron has finished 
    // initialization and is ready to create browser windows. 
    // Some APIs can only be used after this event occurs. 
    app.whenReady().then(createWindow);
    app.on('window-all-closed', function () {
        // On macOS it is common for applications and their menu bar    
        // to stay active until the user quits explicitly with Cmd + Q 
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the 
        // dock icon is clicked and there are no other windows open. 
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
    ipcMain.on('start-sync', function (event, arg) {
        mainApp.Run();
    });
    ipcMain.on('refresh-sync', function (event, arg) {
        mainApp.GetSyncService().RevalidateSyncAll();
    });
    ipcMain.on('pair-accounts', function (event, arg) {
        var service = mainApp.GetSyncService();
        var accountA = service.getTraderAccount(arg[0].broker, arg[0].account_number);
        var accountB = service.getTraderAccount(arg[1].broker, arg[1].account_number);
        service.PairTraderAccountWith(accountA, accountB, true);
    });
    ipcMain.on('remove-pairing', function (event, pairs) {
        for (var _i = 0, pairs_1 = pairs; _i < pairs_1.length; _i++) {
            var pair = pairs_1[_i];
            var service = mainApp.GetSyncService();
            var accountA = service.getTraderAccount(pair[0].broker, pair[0].account_number);
            var accountB = service.getTraderAccount(pair[1].broker, pair[1].account_number);
            if (accountA.Peer() != null
                && accountA.Peer().Broker() == accountB.Broker()
                && accountA.Peer().AccountNumber() == accountB.AccountNumber()) {
                service.RemovePairing(accountA);
            }
            else {
                exports.ipcSend('was-not-paired', "[" + accountA.Broker() + ", " + accountA.AccountNumber() + "] was not paired with [" + accountB.Broker() + ", " + accountB.AccountNumber() + "]");
            }
        }
    });
    ipcMain.on('place-order', function (event, obj) {
        var service = mainApp.GetSyncService();
        var account = service.getTraderAccount(obj.account.broker, obj.account.account_number);
        service.SyncPlaceOrders(account, obj.symbol, obj.lot_size);
    });
    ipcMain.on('save-symbols-config', function (event, obj) {
        SyncUtil_1.SyncUtil.SaveAppConfig(obj, function (success) {
            if (success) {
                exports.ipcSend('symbols-config-save-success', obj);
            }
            else {
                exports.ipcSend('symbols-config-save-fail', false);
            }
        });
    });
    ipcMain.on('get-symbols-config', function (event, obj) {
        exports.ipcSend('symbols-config', SyncUtil_1.SyncUtil.MapToObject(SyncUtil_1.SyncUtil.AppConfigMap));
    });
    ipcMain.on('save-settings', function (event, obj) {
        SyncUtil_1.SyncUtil.SaveAppConfig(obj, function (success) {
            if (success) {
                exports.ipcSend('settings-save-success', obj);
            }
            else {
                exports.ipcSend('settings-save-fail', false);
            }
        });
    });
    ipcMain.on('get-settings', function (event, obj) {
        exports.ipcSend('settings', SyncUtil_1.SyncUtil.MapToObject(SyncUtil_1.SyncUtil.AppConfigMap));
    });
}
//# sourceMappingURL=main.js.map