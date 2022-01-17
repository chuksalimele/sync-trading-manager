'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipcSend = void 0;
Object.defineProperty(exports, "__esModule", { value: true });
var app_1 = require("./app");
var Config_1 = require("./Config");
var Constants_1 = require("./Constants");
var PlaceOrderTrigger_1 = require("./PlaceOrderTrigger");
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
            title: "Sync Trading Manager v" + Config_1.Config.VERSION,
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
        var account_buy = service.getTraderAccount(obj.account_buy.broker, obj.account_buy.account_number);
        var account_a = service.getTraderAccount(obj.account_a.broker, obj.account_a.account_number);
        var account_b = service.getTraderAccount(obj.account_b.broker, obj.account_b.account_number);
        service.SyncPlaceOrders(account_buy, account_a, account_b, obj.symbol, obj.lot_size_a, obj.lot_size_b, parseFloat(obj.trade_split_count), parseFloat(obj.max_percent_diff_in_account_balances));
    });
    ipcMain.on('place-order-trigger', function (event, obj) {
        var service = mainApp.GetSyncService();
        var account_buy = service.getTraderAccount(obj.account_buy.broker, obj.account_buy.account_number);
        var account_a = service.getTraderAccount(obj.account_a.broker, obj.account_a.account_number);
        var account_b = service.getTraderAccount(obj.account_b.broker, obj.account_b.account_number);
        var trigger = new PlaceOrderTrigger_1.PlaceOrderTrigger();
        trigger.buy_trader = account_buy;
        trigger.buy_lot_size = account_buy.StrID() == account_a.StrID() ? obj.lot_size_a : obj.lot_size_b;
        trigger.sell_lot_size = account_buy.StrID() == account_a.StrID() ? obj.lot_size_b : obj.lot_size_a;
        trigger.pair_id = account_buy.PairID();
        trigger.price = obj.trigger_price;
        trigger.pivot_price = account_buy.ChartMarketPrice();
        trigger.type = obj.trigger_type;
        trigger.symbol = obj.symbol;
        trigger.trade_split_count = parseFloat(obj.trade_split_count);
        trigger.max_percent_diff_in_account_balances = parseFloat(obj.max_percent_diff_in_account_balances);
        "<option value=\"Instant now\">Instant now</option>\n                            <option value=\"Instant when both accounts have credit bonuses\">Instant when both accounts have credit bonuses</option>\n                            <option value=\"Pending at price\">Pending at price</option>\n                            <option value=\"Pending at price when both accounts have credit bonuses\">Pending at price when both accounts have credit bonuses</option>\n";
        if (trigger.type == Constants_1.Constants.Pending_at_price
            || trigger.type == Constants_1.Constants.Pending_at_price_when_both_accounts_have_credit_bonuses) {
            if (obj.trigger_price > trigger.pivot_price) {
                trigger.remark = "The order will be execute immediately when market price gets to or goes above " + obj.trigger_price;
            }
            else {
                trigger.remark = "The order will be execute immediately when market price gets to or goes below " + obj.trigger_price;
            }
        }
        if (trigger.type == Constants_1.Constants.Pending_at_price_when_both_accounts_have_credit_bonuses) {
            trigger.remark += " and credit bonuses are available for both accounts";
        }
        if (trigger.type == Constants_1.Constants.Instant_when_both_accounts_have_credit_bonuses) {
            trigger.remark = "The order will be execute immediately when credit bonuses are available for both accounts";
        }
        service.AddPlaceOrderTrigger(trigger);
    });
    ipcMain.on('cancel-place-order-trigger', function (event, uuid) {
        var service = mainApp.GetSyncService();
        service.CancelPlaceOrderTrigger(uuid);
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
    ipcMain.on('get-app-config', function (event, defaultConfigObj) {
        var configObj = SyncUtil_1.SyncUtil.MapToObject(SyncUtil_1.SyncUtil.AppConfigMap);
        for (var n in defaultConfigObj) {
            //set to default if the property is not present in the saved config
            if (!(n in configObj)) {
                configObj[n] = defaultConfigObj[n];
            }
        }
        //Re-save the config
        SyncUtil_1.SyncUtil.SaveAppConfig(configObj, function (success) {
            if (success) {
                exports.ipcSend('app-config', configObj);
            }
            else {
                exports.ipcSend('app-config-init-fail', false);
            }
        });
    });
    ipcMain.on('save-general-settings', function (event, obj) {
        SyncUtil_1.SyncUtil.SaveAppConfig(obj, function (success) {
            if (success) {
                exports.ipcSend('general-settings-save-success', obj);
            }
            else {
                exports.ipcSend('general-settings-save-fail', false);
            }
        });
    });
    ipcMain.on('save-email-notification-config', function (event, obj) {
        SyncUtil_1.SyncUtil.SaveAppConfig(obj, function (success) {
            if (success) {
                exports.ipcSend('email-notification-config-save-success', obj);
            }
            else {
                exports.ipcSend('email-notification-config-save-fail', false);
            }
        });
    });
    ipcMain.on('verify-email-notification-connection', function (event, obj) {
        mainApp.GetSyncService().GetEmailer().verifyConnection(obj, function (error, success) {
            if (success) {
                exports.ipcSend('email-notification-connection-verify-success', obj);
            }
            else {
                exports.ipcSend('email-notification-connection-verify-fail', error);
            }
        });
    });
    ipcMain.on("compute-lot-stoploss-loss-at-stopout", function (event, obj) {
        var service = mainApp.GetSyncService();
        var account = service.getTraderAccount(obj.broker, obj.account_number);
        var lot_size;
        var stoploss_pips; //same as pips at stopout
        var loss_at_stopout;
        var spread_cost;
        var swap_cost_per_day;
        var crash_balance;
        var is_commission_known;
        var commission;
        if (obj.stoploss_pips > 0) {
            stoploss_pips = obj.stoploss_pips;
            lot_size = account.DetermineLotSizefromPips(obj.stoploss_pips);
            loss_at_stopout = account.DetermineLossAtStopout(obj.position, lot_size);
            swap_cost_per_day = account.CalculateSwapPerDay(obj.position, lot_size);
            commission = account.CalculateCommision(lot_size);
        }
        else if (obj.lot_size > 0) {
            lot_size = obj.lot_size;
            stoploss_pips = account.DeterminePipsMoveAtStopout(obj.position, obj.lot_size);
            loss_at_stopout = account.DetermineLossAtStopout(obj.position, obj.lot_size);
            swap_cost_per_day = account.CalculateSwapPerDay(obj.position, obj.lot_size);
            commission = account.CalculateCommision(obj.lot_size);
        }
        is_commission_known = account.IsCommisionKnown();
        spread_cost = account.CalculateSpreadCost(lot_size);
        crash_balance = parseFloat((account.AccountBalance() - loss_at_stopout).toFixed(2));
        var result = {
            account: account.Safecopy(),
            lot_size: lot_size || '',
            stoploss_pips: stoploss_pips || '',
            loss_at_stopout: loss_at_stopout || 0,
            swap_cost_per_day: swap_cost_per_day || 0,
            spread_cost: spread_cost || 0,
            crash_balance: crash_balance || 0,
            commission: commission || 0,
            is_commission_known: is_commission_known,
        };
        exports.ipcSend('lot-stoploss-loss-at-stopout-result', result);
    });
    ipcMain.on('accept-warning-place-order', function (event, uuid) {
        var service = mainApp.GetSyncService();
        service.handlePendingAccountOrderPlacement(uuid, true);
    });
    ipcMain.on('reject-warning-place-order', function (event, uuid) {
        var service = mainApp.GetSyncService();
        service.handlePendingAccountOrderPlacement(uuid, false);
    });
}
//# sourceMappingURL=main.js.map