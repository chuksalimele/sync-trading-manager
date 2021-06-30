'use strict';

  Object.defineProperty(exports, "__esModule", { value: true });

import { App } from './app';
import { Config } from './Config';
import { Constants } from './Constants';
import { PlaceOrderTrigger } from './PlaceOrderTrigger';
import { SyncUtil } from './SyncUtil';
const { app, ipcMain, BrowserWindow } = require('electron')


var win;

var mainApp = new App();

export var ipcSend = function (event, data) {
    win.webContents.send(event, data);
}

Main();

function Main() {

    //The easiest way to handle these arguments and stop your app launching multiple times
    //during install is to use electron - squirrel - startup as one of the first things your app does

    if (require('electron-squirrel-startup')) {//come back to verify this!!!
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
        })

        
        // and load the index.html of the app. 
        win.loadFile(`${__dirname}/../index.html`)

        win.removeMenu();//remove the default menu

        // Open the DevTools. 
        //win.webContents.openDevTools()//UNCOMMENT IN PRODUCTION TO HIDE DEBUGGER VIEW

        //Quit app when main BrowserWindow Instance is closed
        win.on('closed', function () {
            app.quit();
        });
    }

    // This method will be called when the Electron has finished 
    // initialization and is ready to create browser windows. 
    // Some APIs can only be used after this event occurs. 
    app.whenReady().then(createWindow)

    app.on('window-all-closed', () => {
        // On macOS it is common for applications and their menu bar    
        // to stay active until the user quits explicitly with Cmd + Q 
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

    app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the 
        // dock icon is clicked and there are no other windows open. 
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })


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

        for (let pair of pairs) {

            var service = mainApp.GetSyncService();
            var accountA = service.getTraderAccount(pair[0].broker, pair[0].account_number);
            var accountB = service.getTraderAccount(pair[1].broker, pair[1].account_number);

            if (accountA.Peer() != null
                && accountA.Peer().Broker() == accountB.Broker()
                && accountA.Peer().AccountNumber() == accountB.AccountNumber()) {
                service.RemovePairing(accountA);
            } else {
                ipcSend('was-not-paired', `[${accountA.Broker()}, ${accountA.AccountNumber()}] was not paired with [${accountB.Broker()}, ${accountB.AccountNumber()}]`);
            }
        }

    });

    ipcMain.on('place-order', function (event, obj) {

        var service = mainApp.GetSyncService();
        var account_buy = service.getTraderAccount(obj.account_buy.broker, obj.account_buy.account_number);
        var account_a = service.getTraderAccount(obj.account_a.broker, obj.account_a.account_number);
        var account_b = service.getTraderAccount(obj.account_b.broker, obj.account_b.account_number);

        service.SyncPlaceOrders(account_buy, account_a, account_b, obj.symbol, obj.lot_size_a, obj.lot_size_b, obj.max_percent_diff_in_account_balances);

    });

    ipcMain.on('place-order-trigger', function (event, obj) {

        var service = mainApp.GetSyncService();
        var account_buy = service.getTraderAccount(obj.account_buy.broker, obj.account_buy.account_number);
        var account_a = service.getTraderAccount(obj.account_a.broker, obj.account_a.account_number);
        var account_b = service.getTraderAccount(obj.account_b.broker, obj.account_b.account_number);
        var trigger: PlaceOrderTrigger = new PlaceOrderTrigger();

        trigger.buy_trader = account_buy;
        trigger.buy_lot_size = account_buy.StrID() == account_a.StrID() ? obj.lot_size_a : obj.lot_size_b;
        trigger.sell_lot_size = account_buy.StrID() == account_a.StrID() ? obj.lot_size_b : obj.lot_size_a;
        trigger.pair_id = account_buy.PairID();
        trigger.price = obj.trigger_price;
        trigger.pivot_price = account_buy.ChartMarketPrice();
        trigger.type = obj.trigger_type;
        trigger.symbol = obj.symbol;
        trigger.max_percent_diff_in_account_balances = obj.max_percent_diff_in_account_balances;

        `<option value="Instant now">Instant now</option>
                            <option value="Instant when both accounts have credit bonuses">Instant when both accounts have credit bonuses</option>
                            <option value="Pending at price">Pending at price</option>
                            <option value="Pending at price when both accounts have credit bonuses">Pending at price when both accounts have credit bonuses</option>
`

        if (trigger.type == Constants.Pending_at_price
            || trigger.type == Constants.Pending_at_price_when_both_accounts_have_credit_bonuses) {
            if (obj.trigger_price > trigger.pivot_price) {
                trigger.remark = `The order will be execute immediately when market price gets to or goes above ${obj.trigger_price}`
            } else {
                trigger.remark = `The order will be execute immediately when market price gets to or goes below ${obj.trigger_price}`
            }            
        }

        if (trigger.type == Constants.Pending_at_price_when_both_accounts_have_credit_bonuses){
            trigger.remark += ` and credit bonuses are available for both accounts`
        }

        if (trigger.type == Constants.Instant_when_both_accounts_have_credit_bonuses) {
            trigger.remark = `The order will be execute immediately when credit bonuses are available for both accounts`
        }

        service.AddPlaceOrderTrigger(trigger);

    });

    ipcMain.on('cancel-place-order-trigger', function (event, uuid) {

        var service = mainApp.GetSyncService();
        
        service.CancelPlaceOrderTrigger(uuid);

    });


    ipcMain.on('save-symbols-config', function (event, obj) {

        SyncUtil.SaveAppConfig(obj, function (success) {

            if (success) {
                ipcSend('symbols-config-save-success', obj);
            } else {
                ipcSend('symbols-config-save-fail', false);
            }

        });

    });


    ipcMain.on('get-app-config', function (event, defaultConfigObj) {
        var configObj = SyncUtil.MapToObject(SyncUtil.AppConfigMap);

        for (var n in defaultConfigObj) {
            //set to default if the property is not present in the saved config
            if (!(n in configObj)) {
                configObj[n] = defaultConfigObj[n];
            }
        }

        //Re-save the config
        SyncUtil.SaveAppConfig(configObj, function (success) {

            if (success) {
                ipcSend('app-config', configObj);
            } else {
                ipcSend('app-config-init-fail', false);
            }

        });
       
    });


    ipcMain.on('save-general-settings', function (event, obj) {

        SyncUtil.SaveAppConfig(obj, function (success) {

            if (success) {
                ipcSend('general-settings-save-success', obj);
            } else {
                ipcSend('general-settings-save-fail', false);
            }

        });

    });


    ipcMain.on('save-email-notification-config', function (event, obj) {

        SyncUtil.SaveAppConfig(obj, function (success) {

            if (success) {
                ipcSend('email-notification-config-save-success', obj);
            } else {
                ipcSend('email-notification-config-save-fail', false);
            }

        });

    });


    ipcMain.on('verify-email-notification-connection', function (event, obj) {

        mainApp.GetSyncService().GetEmailer().verifyConnection(obj, function (error, success) {

            if (success) {
                ipcSend('email-notification-connection-verify-success', obj);
            } else {
                ipcSend('email-notification-connection-verify-fail', error);
            }

        });

    });


    ipcMain.on('auto-compute-lot-size', function (event, obj) {

        var service = mainApp.GetSyncService();
        var account_a = service.getTraderAccount(obj.account_a.broker, obj.account_a.account_number);
        var account_b = service.getTraderAccount(obj.account_b.broker, obj.account_b.account_number);

        var symbol = obj.symbol;//for now this is not neccessary

        var result_a = account_a.AutoLotSize(account_b);
        var result_b = account_b.AutoLotSize(account_a);


        if (typeof result_a === 'number' && typeof result_b === 'number') {
            ipcSend('auto-lot-size-success', {
                account_a: account_a.Safecopy(),
                account_b: account_b.Safecopy(),
                lot_size_a: result_a,
                lot_size_b: result_b
            });
        }

        if (typeof result_a === 'string') {
            ipcSend('auto-lot-size-fail', {
                account: account_a.Safecopy(),
                error: result_a
            });
        }

        if (typeof result_b === 'string') {
            ipcSend('auto-lot-size-fail', {
                account: account_b.Safecopy(),
                error: result_b
            });
        }

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