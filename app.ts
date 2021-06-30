'use strict';



import { ipcSend } from "./main";
import { SyncService } from "./SyncService"
import { TraderAccount } from "./TraderAccount";
import { Config } from "./Config";

var net = require('net');

export const ipcMain = require('electron').ipcMain
export const fs = require("fs");
export const path = require('path');
export const mkdirp = require('mkdirp');

export class App {

    private service: SyncService = new SyncService();

    constructor() {

    }

    private connectionListener(socket) {
        this.service.AddClient(new TraderAccount(socket));
    }

    public GetSyncService(): SyncService {
        return this.service;
    }

    public Run() {

        this.service.Start();

        var server = net.createServer(this.connectionListener.bind(this));

        server.on('close', this.OnClose.bind(this));

        server.listen(Config.PIPE_PATH, function () {
            //console.log('Stream server pipe listening on ' + Config.PIPE_PATH);
        });

        ipcSend('sync-running', {
            version: Config.VERSION
        });
    }

    OnClose() {
        //console.log('Stream server pipe closed');

        ipcSend('sync-close', true);

        setTimeout(function () {
            //console.log('Stream server pipe restarting...');
            ipcSend('sync-restart', true);
            
        }, 1000);
    }
}

//new App().Run();//will be instantiated and run when the document is ready - see index.js

