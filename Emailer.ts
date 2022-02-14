

var nodemailer = require('nodemailer');

import { ipcSend } from "./main";
import { TraderAccount } from "./TraderAccount";
import { SyncUtil } from "./SyncUtil";
import { Order } from "./Order";

enum TriState {
    INITIAL,
    OFF,
    ON
}

export class Emailer {
    
    private TRISTATE: 0 | 1 | 2;
    private transporter: any;
    private FlagNotifyMarginCall: Map<string, TriState> = new Map();
    private FlagNotifyNearStopout: Map<string, TriState> = new Map();
    private FlagNotifySessionInformationAtInterval: Map<string, number> = new Map();
    
    /**
     *
        SyncUtil.AppConfigMap.get('send_notification_at_margin_call');
        SyncUtil.AppConfigMap.get('send_notification_at_percentage_close_to_stopout');
        SyncUtil.AppConfigMap.get('send_notification_at_percentage_close_to_stopout_input');
        SyncUtil.AppConfigMap.get('send_notification_session_information_every_interval_in_seconds');

        SyncUtil.AppConfigMap.get('notification_sender_email_address');
        SyncUtil.AppConfigMap.get('notification_recipient_email_address');

        SyncUtil.AppConfigMap.get('notification_pool_connection');
        SyncUtil.AppConfigMap.get('notification_secure_connection');
        SyncUtil.AppConfigMap.get('notification_fail_on_invalid_certs');

        SyncUtil.AppConfigMap.get('notification_smtp_host');
        SyncUtil.AppConfigMap.get('notification_smtp_port');
        SyncUtil.AppConfigMap.get('notification_auth_type');
        SyncUtil.AppConfigMap.get('notification_username');
        SyncUtil.AppConfigMap.get('notification_password');
        SyncUtil.AppConfigMap.get('notification_client_id');
        SyncUtil.AppConfigMap.get('notification_client_secret');
        SyncUtil.AppConfigMap.get('notification_access_token');
        SyncUtil.AppConfigMap.get('notification_refresh_token');
        SyncUtil.AppConfigMap.get('notification_expiration_time');
        SyncUtil.AppConfigMap.get('notification_access_url');

     **/
    constructor() {

    }


    public Handler(account: TraderAccount) {

        var notify_at_margin_call = SyncUtil.AppConfigMap.get('send_notification_at_margin_call');
        var notify_at_percent_close_to_stopout = SyncUtil.AppConfigMap.get('send_notification_at_percentage_close_to_stopout');
        var notify_at_percent_close_to_stopout_input = SyncUtil.AppConfigMap.get('send_notification_at_percentage_close_to_stopout_input');
        var notify_session_information_every_interval_in_seconds = SyncUtil.AppConfigMap.get('send_notification_session_information_every_interval_in_seconds');
        var notify_session_information_only_when_market_is_open = SyncUtil.AppConfigMap.get('send_notification_session_information_only_when_market_is_open');

        if (notify_at_margin_call == true) {
            this.CheckToNotifyMarginCall(account);
        }

        if (notify_at_percent_close_to_stopout == true && notify_at_percent_close_to_stopout_input > 0) {
            this.CheckToNotifyNearStopout(account, notify_at_percent_close_to_stopout_input);
        }


        if (notify_session_information_every_interval_in_seconds > 0) {
            if ((notify_session_information_only_when_market_is_open && !account.IsMarketClosed())
                || !notify_session_information_only_when_market_is_open) {

                this.CheckToNotifySessionInformationAtInterval(account, notify_session_information_every_interval_in_seconds);
            }
        }

    }

    //come back - not done yet
    CheckToNotifySessionInformationAtInterval(account: TraderAccount, notify_session_information_every_interval_in_seconds: any) {

        if (!account.Peer()) {
            return;
        }

        if (!notify_session_information_every_interval_in_seconds) {
            return;
        }

        var MidNight = new Date().setHours(0, 0, 0, 0);
        var time_diff_secs = (Date.now() - MidNight)/1000; 

        var factor = Math.floor(time_diff_secs / notify_session_information_every_interval_in_seconds);

        if (factor < 1) {
            return;
        }


        var prev_factor = this.FlagNotifySessionInformationAtInterval.get(account.PairID());

        if (factor == prev_factor) {//already treated
            return;
        }


        //at this point it is the next interval

        this.FlagNotifySessionInformationAtInterval.set(account.PairID(), factor);


        //send the mail
        this.send(
            'SYNC TRADE MANAGER - ACCOUNT INFO NOTIFICATION',
            `<h3>Account Current Information</h3>
                <p>Below are details of your synced trading accounts</p>
                <p>
               <table cellspacing="0"  cellpadding = "5" >
                  <thead style="background: brown; color: white;" > 
                    <tr><th></th><th>${account.IsLiveAccount() ? "Live" : "Demo"} Account A</th><th>${account.IsLiveAccount() ? "Live" : "Demo"} Account B</th><tr>
                  </thead> 

                  <tbody style="text-align: left;"> 
                      <tr>
                            <th style="min-width: 120px;">Broker</th>
                            <td style="min-width: 120px;">${account.Broker()}</td>
                            <td style="min-width: 120px;">${account.Peer().Broker()}</td>
                      </tr>
                      <tr>
                            <th style="min-width: 120px;">Account Number</th>
                            <td style="min-width: 120px;">${account.AccountNumber()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountNumber()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Account Name</th>
                            <td style="min-width: 120px;">${account.AccountName()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountName()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Margin</th>
                            <td style="min-width: 120px;">${account.AccountMargin()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountMargin()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Equity</th>
                            <td style="min-width: 120px;">${account.AccountEquity()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountEquity()}</td>
                      </tr>

                    </tbody>
               </table> 
              </p>  
             `
            +
            this.syncOrdersHTML(account)
        );
        
    }

    CheckToNotifyNearStopout(account: TraderAccount, notify_at_percent_close_to_stopout_input: any) {


        if (!notify_at_percent_close_to_stopout_input) {
            return;
        }

        
        if (account.AccountEquity() >= account.AccountBalance()) {
            this.FlagNotifyNearStopout.set(account.StrID(), TriState.INITIAL);// flag it initial
        }

        if (account.AccountMargin() == 0) {
            return;
        }


        if (account.AccountEquity() > account.AccountMargin()) {
            return;
        }

        //at this point the equity is less than or equal to margin

        var percent = account.AccountEquity() / account.AccountMargin() * 100;

        if (percent > notify_at_percent_close_to_stopout_input + account.AccountStopoutLevel()) {
            return;
        }

        //at this point stopout is near

        if (this.FlagNotifyNearStopout.get(account.StrID()) == TriState.INITIAL) {
            this.FlagNotifyNearStopout.set(account.StrID(), TriState.ON)
        }


        if (this.FlagNotifyNearStopout.get(account.StrID()) === TriState.OFF) {//check if flagged off to avoid unneccessary repetition
            return; 
        }


        //send the mail
        this.send(
            'SYNC TRADE MANAGER - NEAR STOPOUT NOTIFICATION',
            `<h3>Near Stopout Notification</h3>
                <p>This is to notify you that stopout is near. See details below:</p>
                <p>
               <table cellspacing="0"  cellpadding = "5" >
                  <thead style="background: brown; color: white;" > 
                    <tr><th></th><th>${account.IsLiveAccount() ? "Live" : "Demo"} Account Near Stopout</th><th>${account.IsLiveAccount() ? "Live" : "Demo"} Account Peer</th><tr>
                  </thead> 

                  <tbody style="text-align: left;"> 
                      <tr>
                            <th style="min-width: 120px;">Broker</th>
                            <td style="color: red; min-width: 120px;">${account.Broker()}</td>
                            <td style="min-width: 120px;">${account.Peer().Broker()}</td>
                      </tr>
                      <tr>
                            <th style="min-width: 120px;">Account Number</th>
                            <td style="color: red; min-width: 120px;">${account.AccountNumber()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountNumber()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Account Name</th>
                            <td style="color: red; min-width: 120px;">${account.AccountName()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountName()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Margin</th>
                            <td style="color: red; min-width: 120px;">${account.AccountMargin()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountMargin()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Equity</th>
                            <td style="color: red; min-width: 120px;">${account.AccountEquity()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountEquity()}</td>
                      </tr>

                    </tbody> 
               </table> 
              </p>  
             `
            +
            this.syncOrdersHTML(account)
        );


        this.FlagNotifyNearStopout.set(account.StrID(), TriState.OFF);//flag it off 

    }

    CheckToNotifyMarginCall(account: TraderAccount) {

        if (account.AccountEquity() >= account.AccountBalance()) {
            this.FlagNotifyMarginCall.set(account.StrID(), TriState.INITIAL);// flag it initial
        }

        if (account.AccountEquity() > account.AccountMargin()) {
            return;
        }

        //at this margin call has occurred

        if (this.FlagNotifyMarginCall.get(account.StrID()) == TriState.INITIAL) {
            this.FlagNotifyMarginCall.set(account.StrID(), TriState.ON)
        }

        if (this.FlagNotifyMarginCall.get(account.StrID()) == TriState.OFF) {//check if flagged off to avoid unneccessary repetition
            return;
        }

        //send the mail
        this.send(
            'SYNC TRADE MANAGER - MARGIN CALL NOTIFICATION',
            `<h3>Margin Call Notification</h3>
                <p>This is to notify you that margin call has occurred. See details below:</p>
                <p>
               <table cellspacing="0"  cellpadding = "5" >
                  <thead style="background: brown; color: white;" > 
                    <tr><th></th><th>${account.IsLiveAccount() ? "Live" : "Demo"} Account With Margin Call</th><th>${account.IsLiveAccount() ? "Live" : "Demo"} Account Peer</th><tr>
                  </thead> 

                  <tbody style="text-align: left;">
                      <tr>
                            <th style="min-width: 120px;">Broker</th>
                            <td style="color: red; min-width: 120px;">${account.Broker()}</td>
                            <td style="min-width: 120px;">${account.Peer().Broker()}</td>
                      </tr>
                      <tr>
                            <th style="min-width: 120px;">Account Number</th>
                            <td style="color: red; min-width: 120px;">${account.AccountNumber()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountNumber()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Account Name</th>
                            <td style="color: red; min-width: 120px;">${account.AccountName()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountName()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Margin</th>
                            <td style="color: red; min-width: 120px;">${account.AccountMargin()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountMargin()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Equity</th>
                            <td style="color: red; min-width: 120px;">${account.AccountEquity()}</td>
                            <td style="min-width: 120px;">${account.Peer().AccountEquity()}</td>
                      </tr>

                    </tbody>

               </table> 
              </p>  
             `
            +
            this.syncOrdersHTML(account)
        );


        this.FlagNotifyMarginCall.set(account.StrID(), TriState.OFF);//flag it off 
    }

    public OrderOpenNotify(account: TraderAccount, order: Order) {

        this.send(
            'SYNC TRADE MANAGER - ORDER OPENED NOTIFICATION',
            `<h3>Order Opened Notification</h3>
                <p>Order with ticket #${order.ticket} has opened at price ${order.open_price} on the following ${account.IsLiveAccount() ? 'live' : 'demo'} account:</p>
                <p>
                  <table style="text-align: left;"  cellspacing="0"  cellpadding = "2" >
                      <tr>
                            <th style="min-width: 120px;">Broker</th>
                            <td style="min-width: 120px;">${account.Broker()}</td>
                      </tr>
                      <tr>
                            <th style="min-width: 120px;">Account Number</th>
                            <td style="min-width: 120px;">${account.AccountNumber()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Account Name</th>
                            <td style="min-width: 120px;">${account.AccountName()}</td>
                      </tr>

               </table> 
                </p>  
             `
        );


        //check for peer order open
        if (!account.Peer()) {
            return;
        }

        var peer_orders = account.Peer().Orders();
        if (!peer_orders) {
            return;
        }

        if (order.peer_ticket == -1) {
            return;
        }

        var peer_order = peer_orders.find(obj => obj.ticket == order.peer_ticket);

        if (!peer_order) {
            return;
        }

        //at this point we have the peer order so lets check if it is opened too

        if (peer_order.open_time == 0 || peer_order.close_time > 0) {
            return;//leave since we want the one that is open
        }

        //at this point the peer order is also open so send neccessary account information of both accounts

        var acct_red = account.AccountBalance() <= 0 ? " color: red;" : "";
        var peer_acct_red = account.Peer().AccountBalance() <= 0 ? " color: red;" : "";

        var subject = 'SYNC TRADE MANAGER - SYNC OPENED NOTIFICATION';
        var body = `<h3>Sync Opened Notification</h3>
                <p>This is to notify you that two sync orders with tickets ${order.ticket} and ${peer_order.ticket} has successfully opened.</br> See accounts info below:</p>
                <p>
               <table cellspacing="0"  cellpadding = "5" >
                  <thead style="background: brown; color: white;" >
                    <tr><th></th><th>${account.IsLiveAccount() ? "Live" : "Demo"} Account A</th><th>${account.Peer().IsLiveAccount() ? "Live" : "Demo"} Account B</th><tr>
                  </thead> 

                  <tbody style="text-align: left;">
                      <tr>
                            <th style="min-width: 120px;">Broker</th>
                            <td style="${acct_red} min-width: 120px;">${account.Broker()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().Broker()}</td>
                      </tr>
                      <tr>
                            <th style="min-width: 120px;">Account Number</th>
                            <td style="${acct_red} min-width: 120px;">${account.AccountNumber()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().AccountNumber()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Account Name</th>
                            <td style="${acct_red} min-width: 120px;">${account.AccountName()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().AccountName()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Active Trades</th>
                            <td style="${acct_red} min-width: 120px;">${account.OpenOrdersCount()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().OpenOrdersCount()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Margin</th>
                            <td style="${acct_red} min-width: 120px;">${account.AccountMargin()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().AccountMargin()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Equity</th>
                            <td style="${acct_red} min-width: 120px;">${account.AccountEquity()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().AccountEquity()}</td>
                      </tr>

                    </tbody>

               </table> 
              </p>  
             `
            +
            this.syncOrdersHTML(account);


        //send the mail when the stoploss and target of both orders are set

        SyncUtil.WaitAsyncWhile(
            this.send.bind(this, subject, body),
            () => order.stoploss == 0 || order.target == 0 || peer_order.stoploss == 0 || peer_order.target == 0
        );


    }

    public OrderCloseNotify(account: TraderAccount, order: Order) {

        this.send(
            `SYNC TRADE MANAGER - ORDER ${order.force ? 'FORCIBLY ' : ''}CLOSED NOTIFICATION`,
            `<h3>Order ${order.force ? 'Forcibly ' : ''}Closed Notification</h3>
                ${order.force ?
                `<p>Order with ticket #${order.ticket} was forcibly closed at price ${order.close_price} on the following ${account.IsLiveAccount() ? 'live' : 'demo'} account with the following reason:</p>
                <p><strong><i>${order.reason}</i></strong></p>`

                : `<p>Order with ticket #${order.ticket} has closed at price ${order.close_price} on the following ${account.IsLiveAccount() ? 'live' : 'demo'} account:</p>`
            }
                

                <p>
                  <table style="text-align: left;"  cellspacing="0"  cellpadding = "2" >
                      <tr>
                            <th style="min-width: 120px;">Broker</th>
                            <td style="min-width: 120px;">${account.Broker()}</td>
                      </tr>
                      <tr>
                            <th style="min-width: 120px;">Account Number</th>
                            <td style="min-width: 120px;">${account.AccountNumber()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Account Name</th>
                            <td style="min-width: 120px;">${account.AccountName()}</td>
                      </tr>

               </table> 
                </p>  
             `
        );


        //check for peer order close
        if (!account.Peer()) {
            return;
        }

        var peer_orders = account.Peer().Orders();
        if (!peer_orders) {
            return;
        }

        if (order.peer_ticket == -1) {
            return;
        }

        var peer_order = peer_orders.find(obj => obj.ticket == order.peer_ticket);

        if (!peer_order) {
            return;
        }

        //at this point we have the peer order so lets check if it is closed too

        if (peer_order.close_time == 0) {
            return;//leave since we want the one that is closed
        }

        //at this point the peer order is also closed so send neccessary account information of both accounts

        var acct_red = account.AccountBalance() <= 0 ? " color: red;" : "";
        var peer_acct_red = account.Peer().AccountBalance() <= 0 ? " color: red;" : "";

        //send the mail

        var subject = 'SYNC TRADE MANAGER - SYNC CLOSED NOTIFICATION';
        var body = `<h3>Sync Closed Notification</h3>
                <p>This is to notify you that two sync orders with tickets ${order.ticket} and ${peer_order.ticket} has successfully closed.</br> See accounts info below:</p>
                <p>
               <table cellspacing="0"  cellpadding = "5" >
                  <thead style="background: brown; color: white;" >
                    <tr><th></th><th>${account.IsLiveAccount() ? "Live" : "Demo"} Account A</th><th>${account.Peer().IsLiveAccount() ? "Live" : "Demo"} Account B</th><tr>
                  </thead> 

                  <tbody style="text-align: left;">
                      <tr>
                            <th style="min-width: 120px;">Broker</th>
                            <td style="${acct_red} min-width: 120px;">${account.Broker()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().Broker()}</td>
                      </tr>
                      <tr>
                            <th style="min-width: 120px;">Account Number</th>
                            <td style="${acct_red} min-width: 120px;">${account.AccountNumber()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().AccountNumber()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Account Name</th>
                            <td style="${acct_red} min-width: 120px;">${account.AccountName()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().AccountName()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Active Trades</th>
                            <td style="${acct_red} min-width: 120px;">${account.OpenOrdersCount()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().OpenOrdersCount()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Margin</th>
                            <td style="${acct_red} min-width: 120px;">${account.AccountMargin()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().AccountMargin()}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Equity</th>
                            <td style="${acct_red} min-width: 120px;">${account.AccountEquity()}</td>
                            <td style="${peer_acct_red} min-width: 120px;">${account.Peer().AccountEquity()}</td>
                      </tr>

                    </tbody>

               </table> 
              </p>  
             `
            +
            this.syncOrdersHTML(account);


        this.send(subject, body);

    }

    public syncOrdersHTML(account: TraderAccount): string {
        var html: string = '';

        var peerAccount = account.Peer();
        if (peerAccount == null) {
            return html;
        }


        var orders: Order[] = account.Orders();
        if (orders.length == 0) {
            return html;
        }

        var peer_orders: Order[] = peerAccount.Orders();
        if (peer_orders.length == 0) {
            return html;
        }

        var openHtml = html += `<p> <table cellspacing="0"  cellpadding = "5" >
                  <thead style="background: brown; color: white;" >
                    <tr>
                        <th>S/N</th>
                        <th></th>
                        <th>${account.IsLiveAccount() ? "Live" : "Demo"} Account A</th><th>${peerAccount.IsLiveAccount() ? "Live" : "Demo"} Account B</th>
                    <tr>
                  </thead> 

                  <tbody style="text-align: left;"> `;

        var closeHtml = `
                    </tbody>
               </table> </p>`;

        var bodyHtml = '';

        var count = 0;
        for (var order of orders) {
            count++;
            for (var peer_order of peer_orders) {
                if (peer_order.ticket != order.peer_ticket) {
                    continue;
                }
                //at this point we have the sycned orders
                bodyHtml += `
                      <tr>
                            <th  rowspan = "5" align="center" valign="middle" style="width: 40px;">${count}</th> 
                            <th style="min-width: 120px;">Ticket</th>
                            <td style="min-width: 120px;">#${order.ticket}</td>
                            <td style="min-width: 120px;">#${peer_order.ticket}</td>
                      </tr>
                      <tr>
                            <th style="min-width: 120px;">Open Price</th>
                            <td style="min-width: 120px;">${order.open_price}</td>
                            <td style="min-width: 120px;">${peer_order.open_price}</td>
                      </tr>

                      ${order.close_time > 0 ? `<tr>
                            <th style="min-width: 120px;">Close Price</th>
                            <td style="min-width: 120px;">${order.close_price}</td>
                            <td style="min-width: 120px;">${peer_order.close_price}</td>
                      </tr>`: ''}

                      <tr>
                            <th style="min-width: 120px;">Target</th>
                            <td style="min-width: 120px;">${order.target}</td>
                            <td style="min-width: 120px;">${peer_order.target}</td>
                      </tr>

                      <tr>
                            <th style="min-width: 120px;">Stoploss</th>
                            <td style="min-width: 120px;">${order.stoploss}</td>
                            <td style="min-width: 120px;">${peer_order.stoploss}</td>
                      </tr>`;

                break;
            }
        }

        html = openHtml + bodyHtml + closeHtml;


        return html;
    }

    public verifyConnection(param, callback: Function) {

        var transporter = nodemailer.createTransport({
            host: param.notification_smtp_host,
            port: param.notification_smtp_port,
            secure: param.notification_secure_connection, // use TLS
            auth: {
                user: param.notification_username,
                pass: param.notification_password
            },
            tls: {
                // do not fail on invalid certs
                rejectUnauthorized: param.notification_fail_on_invalid_certs
            }
        })


        transporter.verify(function (error, success) {
            callback(error, success);           
        });

    }

    public send(subject: string, body: string) {

        var sender_email_address = SyncUtil.AppConfigMap.get('notification_sender_email_address');
        var recipient_email_address = SyncUtil.AppConfigMap.get('notification_recipient_email_address');

        var pool = SyncUtil.AppConfigMap.get('notification_pool_connection');
        var fail_on_invalid_certs = SyncUtil.AppConfigMap.get('notification_fail_on_invalid_certs');

        var auth_pass = SyncUtil.AppConfigMap.get('notification_password');
        var auth_access_url = SyncUtil.AppConfigMap.get('notification_access_url');

        var host = SyncUtil.AppConfigMap.get('notification_smtp_host');
        var port = SyncUtil.AppConfigMap.get('notification_smtp_port');
        var secure = SyncUtil.AppConfigMap.get('notification_secure_connection');
        var auth_type = SyncUtil.AppConfigMap.get('notification_auth_type');
        var auth_user = SyncUtil.AppConfigMap.get('notification_username');
        var auth_client_id = SyncUtil.AppConfigMap.get('notification_client_id');
        var auth_client_secret = SyncUtil.AppConfigMap.get('notification_client_secret');
        var auth_access_token = SyncUtil.AppConfigMap.get('notification_access_token');
        var auth_refresh_token = SyncUtil.AppConfigMap.get('notification_refresh_token');
        var auth_expires = SyncUtil.AppConfigMap.get('notification_expiration_time');

        if (!host) {

            return;
        }

        if (!port) {

            return;
        }


        if (!auth_type) {

            return;
        }

        if (!auth_user) {

            return;
        }


        if (!sender_email_address) {
            sender_email_address = auth_user;
        }


        if (!recipient_email_address) {
            return;
        }

        if (auth_type == 'OAuth2') {

            this.transporter = nodemailer.createTransport({
                host: host,
                port: port,
                secure: secure,
                auth: {
                    type: auth_type,
                    user: auth_user,
                    clientId: auth_client_id,
                    clientSecret: auth_client_secret,
                    refreshToken: auth_refresh_token,
                    accessToken: auth_access_token,
                    expires: auth_expires
                }
            });


            this.transporter.on('token', token => {
                console.log('A new access token was generated');
                console.log('User: %s', token.user);
                console.log('Access Token: %s', token.accessToken);
                console.log('Expires: %s', new Date(token.expires));

                SyncUtil.AppConfigMap.set('notification_username', token.user);
                SyncUtil.AppConfigMap.set('notification_access_token', token.accessToken);
                SyncUtil.AppConfigMap.set('notification_expiration_time', token.expires);

                var configObj = SyncUtil.MapToObject(SyncUtil.AppConfigMap);

                ipcSend('notification-access-token-refresh', configObj);

                SyncUtil.SaveAppConfig(configObj, function (success) {
                    if (success) {
                        ipcSend('notification-access-token-refresh-save-success', true);
                    } else {
                        ipcSend('notification-access-token-refresh-save-fail', false);
                    }

                })
            });

        } else {

            this.transporter = nodemailer.createTransport({
                host: host,
                port: port,
                secure: secure,
                auth: {
                    user: auth_user,
                    pass: auth_pass
                }
            });



        }

        this.transporter.sendMail({
            from: sender_email_address,
            to: recipient_email_address,
            subject: subject,
            html: body,
            
        }).then(info => {
            console.log('Preview URL: ' + nodemailer.getTestMessageUrl(info));
        });


    }
}