'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.App = exports.mkdirp = exports.path = exports.fs = exports.ipcMain = void 0;
var main_1 = require("./main");
var SyncService_1 = require("./SyncService");
var TraderAccount_1 = require("./TraderAccount");
var Config_1 = require("./Config");
var net = require('net');
exports.ipcMain = require('electron').ipcMain;
exports.fs = require("fs");
exports.path = require('path');
exports.mkdirp = require('mkdirp');
var App = /** @class */ (function () {
    function App() {
        this.service = new SyncService_1.SyncService();
    }
    App.prototype.connectionListener = function (socket) {
        this.service.AddClient(new TraderAccount_1.TraderAccount(socket));
    };
    App.prototype.GetSyncService = function () {
        return this.service;
    };
    App.prototype.Run = function () {
        this.service.Start();
        var server = net.createServer(this.connectionListener.bind(this));
        server.on('close', this.OnClose.bind(this));
        server.listen(Config_1.Config.PIPE_PATH, function () {
            //console.log('Stream server pipe listening on ' + Config.PIPE_PATH);
        });
        main_1.ipcSend('sync-running', true);
    };
    App.prototype.OnClose = function () {
        //console.log('Stream server pipe closed');
        main_1.ipcSend('sync-close', true);
        setTimeout(function () {
            //console.log('Stream server pipe restarting...');
            main_1.ipcSend('sync-restart', true);
        }, 1000);
    };
    return App;
}());
exports.App = App;
//# sourceMappingURL=app.js.map