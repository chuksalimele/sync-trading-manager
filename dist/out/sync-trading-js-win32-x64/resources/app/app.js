'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = exports.google = exports.readline = exports.mkdirp = exports.os = exports.path = exports.fs = exports.ipcMain = void 0;
var main_1 = require("./main");
var SyncService_1 = require("./SyncService");
var TraderAccount_1 = require("./TraderAccount");
var Config_1 = require("./Config");
var net = require('net');
exports.ipcMain = require('electron').ipcMain;
exports.fs = require("fs");
exports.path = require('path');
exports.os = require('os');
exports.mkdirp = require('mkdirp');
exports.readline = require('readline');
exports.google = require('googleapis').google;
var App = /** @class */ (function () {
    function App() {
        this.service = new SyncService_1.SyncService();
        this.server = null;
        this.isStop = false;
    }
    App.prototype.connectionListener = function (socket) {
        this.service.AddClient(new TraderAccount_1.TraderAccount(socket));
    };
    App.prototype.GetSyncService = function () {
        return this.service;
    };
    App.prototype.Run = function () {
        this.service.Start();
        this.server = net.createServer(this.connectionListener.bind(this));
        this.server.on('close', this.OnClose.bind(this));
        try {
            this.server.listen(Config_1.Config.PIPE_PATH, function () {
                //console.log('Stream server pipe listening on ' + Config.PIPE_PATH);
            });
            main_1.ipcSend('sync-running', {
                version: Config_1.Config.VERSION
            });
        }
        catch (error) {
            console.log(error);
        }
    };
    App.prototype.Close = function (accounts) {
        this.isStop = true;
        this.server.close();
        try {
            for (var _i = 0, accounts_1 = accounts; _i < accounts_1.length; _i++) {
                var account = accounts_1[_i];
                account.Close();
            }
        }
        catch (error) {
            console.log(error);
        }
    };
    App.prototype.OnClose = function () {
        //console.log('Stream server pipe closed');
        main_1.ipcSend('sync-close', true);
        if (!this.isStop) { // only restart if we did not intentionally stop the server
            setTimeout(function () {
                //console.log('Stream server pipe restarting...');
                main_1.ipcSend('sync-restart', true);
            }, 1000);
        }
    };
    return App;
}());
exports.App = App;
//# sourceMappingURL=app.js.map