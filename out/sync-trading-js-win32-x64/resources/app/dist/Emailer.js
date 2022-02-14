"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Emailer = void 0;
var nodemailer = require('nodemailer');
var main_1 = require("./main");
var SyncUtil_1 = require("./SyncUtil");
var TriState;
(function (TriState) {
    TriState[TriState["INITIAL"] = 0] = "INITIAL";
    TriState[TriState["OFF"] = 1] = "OFF";
    TriState[TriState["ON"] = 2] = "ON";
})(TriState || (TriState = {}));
var Emailer = /** @class */ (function () {
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
    function Emailer() {
        this.FlagNotifyMarginCall = new Map();
        this.FlagNotifyNearStopout = new Map();
        this.FlagNotifySessionInformationAtInterval = new Map();
    }
    Emailer.prototype.Handler = function (account) {
        var notify_at_margin_call = SyncUtil_1.SyncUtil.AppConfigMap.get('send_notification_at_margin_call');
        var notify_at_percent_close_to_stopout = SyncUtil_1.SyncUtil.AppConfigMap.get('send_notification_at_percentage_close_to_stopout');
        var notify_at_percent_close_to_stopout_input = SyncUtil_1.SyncUtil.AppConfigMap.get('send_notification_at_percentage_close_to_stopout_input');
        var notify_session_information_every_interval_in_seconds = SyncUtil_1.SyncUtil.AppConfigMap.get('send_notification_session_information_every_interval_in_seconds');
        var notify_session_information_only_when_market_is_open = SyncUtil_1.SyncUtil.AppConfigMap.get('send_notification_session_information_only_when_market_is_open');
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
    };
    //come back - not done yet
    Emailer.prototype.CheckToNotifySessionInformationAtInterval = function (account, notify_session_information_every_interval_in_seconds) {
        if (!account.Peer()) {
            return;
        }
        if (!notify_session_information_every_interval_in_seconds) {
            return;
        }
        var MidNight = new Date().setHours(0, 0, 0, 0);
        var time_diff_secs = (Date.now() - MidNight) / 1000;
        var factor = Math.floor(time_diff_secs / notify_session_information_every_interval_in_seconds);
        if (factor < 1) {
            return;
        }
        var prev_factor = this.FlagNotifySessionInformationAtInterval.get(account.PairID());
        if (factor == prev_factor) { //already treated
            return;
        }
        //at this point it is the next interval
        this.FlagNotifySessionInformationAtInterval.set(account.PairID(), factor);
        //send the mail
        this.send('SYNC TRADE MANAGER - ACCOUNT INFO NOTIFICATION', "<h3>Account Current Information</h3>\n                <p>Below are details of your synced trading accounts</p>\n                <p>\n               <table cellspacing=\"0\"  cellpadding = \"5\" >\n                  <thead style=\"background: brown; color: white;\" > \n                    <tr><th></th><th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account A</th><th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account B</th><tr>\n                  </thead> \n\n                  <tbody style=\"text-align: left;\"> \n                      <tr>\n                            <th style=\"min-width: 120px;\">Broker</th>\n                            <td style=\"min-width: 120px;\">" + account.Broker() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().Broker() + "</td>\n                      </tr>\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Number</th>\n                            <td style=\"min-width: 120px;\">" + account.AccountNumber() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountNumber() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Name</th>\n                            <td style=\"min-width: 120px;\">" + account.AccountName() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountName() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Margin</th>\n                            <td style=\"min-width: 120px;\">" + account.AccountMargin() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountMargin() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Equity</th>\n                            <td style=\"min-width: 120px;\">" + account.AccountEquity() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountEquity() + "</td>\n                      </tr>\n\n                    </tbody>\n               </table> \n              </p>  \n             "
            +
                this.syncOrdersHTML(account));
    };
    Emailer.prototype.CheckToNotifyNearStopout = function (account, notify_at_percent_close_to_stopout_input) {
        if (!notify_at_percent_close_to_stopout_input) {
            return;
        }
        if (account.AccountEquity() >= account.AccountBalance()) {
            this.FlagNotifyNearStopout.set(account.StrID(), TriState.INITIAL); // flag it initial
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
            this.FlagNotifyNearStopout.set(account.StrID(), TriState.ON);
        }
        if (this.FlagNotifyNearStopout.get(account.StrID()) === TriState.OFF) { //check if flagged off to avoid unneccessary repetition
            return;
        }
        //send the mail
        this.send('SYNC TRADE MANAGER - NEAR STOPOUT NOTIFICATION', "<h3>Near Stopout Notification</h3>\n                <p>This is to notify you that stopout is near. See details below:</p>\n                <p>\n               <table cellspacing=\"0\"  cellpadding = \"5\" >\n                  <thead style=\"background: brown; color: white;\" > \n                    <tr><th></th><th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account Near Stopout</th><th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account Peer</th><tr>\n                  </thead> \n\n                  <tbody style=\"text-align: left;\"> \n                      <tr>\n                            <th style=\"min-width: 120px;\">Broker</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.Broker() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().Broker() + "</td>\n                      </tr>\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Number</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.AccountNumber() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountNumber() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Name</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.AccountName() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountName() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Margin</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.AccountMargin() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountMargin() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Equity</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.AccountEquity() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountEquity() + "</td>\n                      </tr>\n\n                    </tbody> \n               </table> \n              </p>  \n             "
            +
                this.syncOrdersHTML(account));
        this.FlagNotifyNearStopout.set(account.StrID(), TriState.OFF); //flag it off 
    };
    Emailer.prototype.CheckToNotifyMarginCall = function (account) {
        if (account.AccountEquity() >= account.AccountBalance()) {
            this.FlagNotifyMarginCall.set(account.StrID(), TriState.INITIAL); // flag it initial
        }
        if (account.AccountEquity() > account.AccountMargin()) {
            return;
        }
        //at this margin call has occurred
        if (this.FlagNotifyMarginCall.get(account.StrID()) == TriState.INITIAL) {
            this.FlagNotifyMarginCall.set(account.StrID(), TriState.ON);
        }
        if (this.FlagNotifyMarginCall.get(account.StrID()) == TriState.OFF) { //check if flagged off to avoid unneccessary repetition
            return;
        }
        //send the mail
        this.send('SYNC TRADE MANAGER - MARGIN CALL NOTIFICATION', "<h3>Margin Call Notification</h3>\n                <p>This is to notify you that margin call has occurred. See details below:</p>\n                <p>\n               <table cellspacing=\"0\"  cellpadding = \"5\" >\n                  <thead style=\"background: brown; color: white;\" > \n                    <tr><th></th><th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account With Margin Call</th><th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account Peer</th><tr>\n                  </thead> \n\n                  <tbody style=\"text-align: left;\">\n                      <tr>\n                            <th style=\"min-width: 120px;\">Broker</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.Broker() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().Broker() + "</td>\n                      </tr>\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Number</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.AccountNumber() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountNumber() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Name</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.AccountName() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountName() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Margin</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.AccountMargin() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountMargin() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Equity</th>\n                            <td style=\"color: red; min-width: 120px;\">" + account.AccountEquity() + "</td>\n                            <td style=\"min-width: 120px;\">" + account.Peer().AccountEquity() + "</td>\n                      </tr>\n\n                    </tbody>\n\n               </table> \n              </p>  \n             "
            +
                this.syncOrdersHTML(account));
        this.FlagNotifyMarginCall.set(account.StrID(), TriState.OFF); //flag it off 
    };
    Emailer.prototype.OrderOpenNotify = function (account, order) {
        this.send('SYNC TRADE MANAGER - ORDER OPENED NOTIFICATION', "<h3>Order Opened Notification</h3>\n                <p>Order with ticket #" + order.ticket + " has opened at price " + order.open_price + " on the following " + (account.IsLiveAccount() ? 'live' : 'demo') + " account:</p>\n                <p>\n                  <table style=\"text-align: left;\"  cellspacing=\"0\"  cellpadding = \"2\" >\n                      <tr>\n                            <th style=\"min-width: 120px;\">Broker</th>\n                            <td style=\"min-width: 120px;\">" + account.Broker() + "</td>\n                      </tr>\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Number</th>\n                            <td style=\"min-width: 120px;\">" + account.AccountNumber() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Name</th>\n                            <td style=\"min-width: 120px;\">" + account.AccountName() + "</td>\n                      </tr>\n\n               </table> \n                </p>  \n             ");
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
        var peer_order = peer_orders.find(function (obj) { return obj.ticket == order.peer_ticket; });
        if (!peer_order) {
            return;
        }
        //at this point we have the peer order so lets check if it is opened too
        if (peer_order.open_time == 0 || peer_order.close_time > 0) {
            return; //leave since we want the one that is open
        }
        //at this point the peer order is also open so send neccessary account information of both accounts
        var acct_red = account.AccountBalance() <= 0 ? " color: red;" : "";
        var peer_acct_red = account.Peer().AccountBalance() <= 0 ? " color: red;" : "";
        var subject = 'SYNC TRADE MANAGER - SYNC OPENED NOTIFICATION';
        var body = "<h3>Sync Opened Notification</h3>\n                <p>This is to notify you that two sync orders with tickets " + order.ticket + " and " + peer_order.ticket + " has successfully opened.</br> See accounts info below:</p>\n                <p>\n               <table cellspacing=\"0\"  cellpadding = \"5\" >\n                  <thead style=\"background: brown; color: white;\" >\n                    <tr><th></th><th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account A</th><th>" + (account.Peer().IsLiveAccount() ? "Live" : "Demo") + " Account B</th><tr>\n                  </thead> \n\n                  <tbody style=\"text-align: left;\">\n                      <tr>\n                            <th style=\"min-width: 120px;\">Broker</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.Broker() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().Broker() + "</td>\n                      </tr>\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Number</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.AccountNumber() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().AccountNumber() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Name</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.AccountName() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().AccountName() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Active Trades</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.OpenOrdersCount() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().OpenOrdersCount() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Margin</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.AccountMargin() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().AccountMargin() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Equity</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.AccountEquity() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().AccountEquity() + "</td>\n                      </tr>\n\n                    </tbody>\n\n               </table> \n              </p>  \n             "
            +
                this.syncOrdersHTML(account);
        //send the mail when the stoploss and target of both orders are set
        SyncUtil_1.SyncUtil.WaitAsyncWhile(this.send.bind(this, subject, body), function () { return order.stoploss == 0 || order.target == 0 || peer_order.stoploss == 0 || peer_order.target == 0; });
    };
    Emailer.prototype.OrderCloseNotify = function (account, order) {
        this.send("SYNC TRADE MANAGER - ORDER " + (order.force ? 'FORCIBLY ' : '') + "CLOSED NOTIFICATION", "<h3>Order " + (order.force ? 'Forcibly ' : '') + "Closed Notification</h3>\n                " + (order.force ?
            "<p>Order with ticket #" + order.ticket + " was forcibly closed at price " + order.close_price + " on the following " + (account.IsLiveAccount() ? 'live' : 'demo') + " account with the following reason:</p>\n                <p><strong><i>" + order.reason + "</i></strong></p>"
            : "<p>Order with ticket #" + order.ticket + " has closed at price " + order.close_price + " on the following " + (account.IsLiveAccount() ? 'live' : 'demo') + " account:</p>") + "\n                \n\n                <p>\n                  <table style=\"text-align: left;\"  cellspacing=\"0\"  cellpadding = \"2\" >\n                      <tr>\n                            <th style=\"min-width: 120px;\">Broker</th>\n                            <td style=\"min-width: 120px;\">" + account.Broker() + "</td>\n                      </tr>\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Number</th>\n                            <td style=\"min-width: 120px;\">" + account.AccountNumber() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Name</th>\n                            <td style=\"min-width: 120px;\">" + account.AccountName() + "</td>\n                      </tr>\n\n               </table> \n                </p>  \n             ");
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
        var peer_order = peer_orders.find(function (obj) { return obj.ticket == order.peer_ticket; });
        if (!peer_order) {
            return;
        }
        //at this point we have the peer order so lets check if it is closed too
        if (peer_order.close_time == 0) {
            return; //leave since we want the one that is closed
        }
        //at this point the peer order is also closed so send neccessary account information of both accounts
        var acct_red = account.AccountBalance() <= 0 ? " color: red;" : "";
        var peer_acct_red = account.Peer().AccountBalance() <= 0 ? " color: red;" : "";
        //send the mail
        var subject = 'SYNC TRADE MANAGER - SYNC CLOSED NOTIFICATION';
        var body = "<h3>Sync Closed Notification</h3>\n                <p>This is to notify you that two sync orders with tickets " + order.ticket + " and " + peer_order.ticket + " has successfully closed.</br> See accounts info below:</p>\n                <p>\n               <table cellspacing=\"0\"  cellpadding = \"5\" >\n                  <thead style=\"background: brown; color: white;\" >\n                    <tr><th></th><th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account A</th><th>" + (account.Peer().IsLiveAccount() ? "Live" : "Demo") + " Account B</th><tr>\n                  </thead> \n\n                  <tbody style=\"text-align: left;\">\n                      <tr>\n                            <th style=\"min-width: 120px;\">Broker</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.Broker() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().Broker() + "</td>\n                      </tr>\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Number</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.AccountNumber() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().AccountNumber() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Account Name</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.AccountName() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().AccountName() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Active Trades</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.OpenOrdersCount() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().OpenOrdersCount() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Margin</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.AccountMargin() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().AccountMargin() + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Equity</th>\n                            <td style=\"" + acct_red + " min-width: 120px;\">" + account.AccountEquity() + "</td>\n                            <td style=\"" + peer_acct_red + " min-width: 120px;\">" + account.Peer().AccountEquity() + "</td>\n                      </tr>\n\n                    </tbody>\n\n               </table> \n              </p>  \n             "
            +
                this.syncOrdersHTML(account);
        this.send(subject, body);
    };
    Emailer.prototype.syncOrdersHTML = function (account) {
        var html = '';
        var peerAccount = account.Peer();
        if (peerAccount == null) {
            return html;
        }
        var orders = account.Orders();
        if (orders.length == 0) {
            return html;
        }
        var peer_orders = peerAccount.Orders();
        if (peer_orders.length == 0) {
            return html;
        }
        var openHtml = html += "<p> <table cellspacing=\"0\"  cellpadding = \"5\" >\n                  <thead style=\"background: brown; color: white;\" >\n                    <tr>\n                        <th>S/N</th>\n                        <th></th>\n                        <th>" + (account.IsLiveAccount() ? "Live" : "Demo") + " Account A</th><th>" + (peerAccount.IsLiveAccount() ? "Live" : "Demo") + " Account B</th>\n                    <tr>\n                  </thead> \n\n                  <tbody style=\"text-align: left;\"> ";
        var closeHtml = "\n                    </tbody>\n               </table> </p>";
        var bodyHtml = '';
        var count = 0;
        for (var _i = 0, orders_1 = orders; _i < orders_1.length; _i++) {
            var order = orders_1[_i];
            count++;
            for (var _a = 0, peer_orders_1 = peer_orders; _a < peer_orders_1.length; _a++) {
                var peer_order = peer_orders_1[_a];
                if (peer_order.ticket != order.peer_ticket) {
                    continue;
                }
                //at this point we have the sycned orders
                bodyHtml += "\n                      <tr>\n                            <th  rowspan = \"5\" align=\"center\" valign=\"middle\" style=\"width: 40px;\">" + count + "</th> \n                            <th style=\"min-width: 120px;\">Ticket</th>\n                            <td style=\"min-width: 120px;\">#" + order.ticket + "</td>\n                            <td style=\"min-width: 120px;\">#" + peer_order.ticket + "</td>\n                      </tr>\n                      <tr>\n                            <th style=\"min-width: 120px;\">Open Price</th>\n                            <td style=\"min-width: 120px;\">" + order.open_price + "</td>\n                            <td style=\"min-width: 120px;\">" + peer_order.open_price + "</td>\n                      </tr>\n\n                      " + (order.close_time > 0 ? "<tr>\n                            <th style=\"min-width: 120px;\">Close Price</th>\n                            <td style=\"min-width: 120px;\">" + order.close_price + "</td>\n                            <td style=\"min-width: 120px;\">" + peer_order.close_price + "</td>\n                      </tr>" : '') + "\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Target</th>\n                            <td style=\"min-width: 120px;\">" + order.target + "</td>\n                            <td style=\"min-width: 120px;\">" + peer_order.target + "</td>\n                      </tr>\n\n                      <tr>\n                            <th style=\"min-width: 120px;\">Stoploss</th>\n                            <td style=\"min-width: 120px;\">" + order.stoploss + "</td>\n                            <td style=\"min-width: 120px;\">" + peer_order.stoploss + "</td>\n                      </tr>";
                break;
            }
        }
        html = openHtml + bodyHtml + closeHtml;
        return html;
    };
    Emailer.prototype.verifyConnection = function (param, callback) {
        var transporter = nodemailer.createTransport({
            host: param.notification_smtp_host,
            port: param.notification_smtp_port,
            secure: param.notification_secure_connection,
            auth: {
                user: param.notification_username,
                pass: param.notification_password
            },
            tls: {
                // do not fail on invalid certs
                rejectUnauthorized: param.notification_fail_on_invalid_certs
            }
        });
        transporter.verify(function (error, success) {
            callback(error, success);
        });
    };
    Emailer.prototype.send = function (subject, body) {
        var sender_email_address = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_sender_email_address');
        var recipient_email_address = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_recipient_email_address');
        var pool = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_pool_connection');
        var fail_on_invalid_certs = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_fail_on_invalid_certs');
        var auth_pass = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_password');
        var auth_access_url = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_access_url');
        var host = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_smtp_host');
        var port = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_smtp_port');
        var secure = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_secure_connection');
        var auth_type = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_auth_type');
        var auth_user = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_username');
        var auth_client_id = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_client_id');
        var auth_client_secret = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_client_secret');
        var auth_access_token = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_access_token');
        var auth_refresh_token = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_refresh_token');
        var auth_expires = SyncUtil_1.SyncUtil.AppConfigMap.get('notification_expiration_time');
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
            this.transporter.on('token', function (token) {
                console.log('A new access token was generated');
                console.log('User: %s', token.user);
                console.log('Access Token: %s', token.accessToken);
                console.log('Expires: %s', new Date(token.expires));
                SyncUtil_1.SyncUtil.AppConfigMap.set('notification_username', token.user);
                SyncUtil_1.SyncUtil.AppConfigMap.set('notification_access_token', token.accessToken);
                SyncUtil_1.SyncUtil.AppConfigMap.set('notification_expiration_time', token.expires);
                var configObj = SyncUtil_1.SyncUtil.MapToObject(SyncUtil_1.SyncUtil.AppConfigMap);
                main_1.ipcSend('notification-access-token-refresh', configObj);
                SyncUtil_1.SyncUtil.SaveAppConfig(configObj, function (success) {
                    if (success) {
                        main_1.ipcSend('notification-access-token-refresh-save-success', true);
                    }
                    else {
                        main_1.ipcSend('notification-access-token-refresh-save-fail', false);
                    }
                });
            });
        }
        else {
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
        }).then(function (info) {
            console.log('Preview URL: ' + nodemailer.getTestMessageUrl(info));
        });
    };
    return Emailer;
}());
exports.Emailer = Emailer;
//# sourceMappingURL=Emailer.js.map