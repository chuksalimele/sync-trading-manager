'use strict';



import { ipcSend } from "./main";
import { SyncService } from "./SyncService"
import { TraderAccount } from "./TraderAccount";
import { Config } from "./Config";

var net = require('net');

export const ipcMain = require('electron').ipcMain
export const fs = require("fs");
export const path = require('path');
export const os = require('os');
export const mkdirp = require('mkdirp');
export const readline = require('readline');
export const {google} = require('googleapis');

export class App {

    private service: SyncService = new SyncService();
    private server: any = null;
    private isStop: boolean = false;
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

        this.server = net.createServer(this.connectionListener.bind(this));

        this.server.on('close', this.OnClose.bind(this));

        try {
         
            this.server.listen(Config.PIPE_PATH, function () {
                //console.log('Stream server pipe listening on ' + Config.PIPE_PATH);
            });

            ipcSend('sync-running', {
                version: Config.VERSION
            });   
        } catch (error) {
            console.log(error);
        }
    }

    public Close(accounts: Array<TraderAccount>){
        this.isStop = true;
        
        this.server.close();
        try {             
            for(var account of accounts){
                account.Close();
            }   
        } catch (error) {
            console.log(error);
        }
    }

    OnClose() {
        //console.log('Stream server pipe closed');

        ipcSend('sync-close', true);

        if(!this.isStop){// only restart if we did not intentionally stop the server
            setTimeout(function () {
                //console.log('Stream server pipe restarting...');
                ipcSend('sync-restart', true);
                
            }, 1000);
        }
    }
}

//new App().Run();//will be instantiated and run when the document is ready - see index.js

