const electron = nodeRequire("electron");
const ipc = electron.ipcRenderer;

var Version;

var isVersionConflictReported = false;

var NOT_PAIRED = "Not paired";
var PAIRED = "Paired";
var DISCONNECTED = "Disconnected";

var cursorIndex = 0;

var paired_accounts = []; //map

var unpaired_accounts = [];

var orders = [];

var paired_orders = [];

var place_order_triggers = [];

var logs = [];

var selectedPairingAccountA = null;

var selectedPairingAccountB = null;

var prevPairedTableHTML = null;

var AppConfig = {
  //set default properties
  spread: {},
  symbol: {},
  maximum_log_records: 200,
  sync_check_interval_in_seconds: 10,
  refresh_account_info_interval_in_seconds: 30,
  notification_pool_connection: true,
  notification_secure_connection: true,
  send_notification_session_information_only_when_market_is_open: true,
};

var alertCollection = [];

var HideProgresBarTimerId = -1;

//set AlertifyJS defaults - visit the website to see more options

alertify.defaults.transition = "zoom"; //options are: slide, pulse, flipx, flipy, zoom, fade
alertify.defaults.notifier.delay = 20;
alertify.defaults.notifier.position = "bottom-right";

  $(document).ready(function () {
    $(".menu .item").tab();

    $("#btn_main").on("click", function () {
      showMain();
    });

    $("#btn_place_order_triggers").on("click", function () {
      hideCenterContents();
      $("#btn_place_order_triggers").addClass("active");
      $("#center_content_place_order_triggers").fadeIn();
      displayPlaceOrderTriggers();
    });

    $("#btn_pairing").on("click", function () {
      hideCenterContents();
      $("#btn_pairing").addClass("active");
      $("#center_content_pairing").fadeIn();
      pairingComponent();
    });

    $("#btn_output").on("click", function () {
      hideCenterContents();
      $("#btn_output").addClass("active");
      $("#center_content_output").fadeIn();
      displayLog();
    });

    $("#btn_metrics").on("click", function () {
      hideCenterContents();
      $("#btn_metrics").addClass("active");
      $("#center_content_metrics").fadeIn();
      displayMetrics();
    });
    
    $("#btn_install_ea").on("click", function () {
      hideCenterContents();
      $("#btn_install_ea").addClass("active");
      $("#center_content_install_ea").fadeIn();
      displayInstallEA();
    });

    
    $("#btn_settings").on("click", function () {
      hideCenterContents();
      $("#btn_settings").addClass("active");
      $("#center_content_settings").fadeIn();
      settings();
    });

    $("#pairing_account_btn").on("click", function () {
      if (!selectedPairingAccountA || !selectedPairingAccountB) {
        return;
      }

      if (
        selectedPairingAccountA.broker == selectedPairingAccountB.broker &&
        selectedPairingAccountA.account_number ==
          selectedPairingAccountB.account_number
      ) {
        alertBox(
          "Invalid",
          "Cannot pair an account to itseft! Please select another account."
        );
        return;
      }

      ipc.send("pair-accounts", [
        selectedPairingAccountA,
        selectedPairingAccountB,
      ]);

      //clear selection

      selectedPairingAccountA = null;
      selectedPairingAccountB = null;

      setTimeout(function () {
        $("#pairing_accounts_dropdown_b").dropdown("clear");
      }, 0);

      setTimeout(function () {
        $("#pairing_accounts_dropdown_a").dropdown("clear");
      }, 0);
    });

    $("#pairing_account_remove_pairing_btn").on("click", function () {
      var pairs = getSelectedPairingsToRemove(); //array of pairs
      if (pairs.length > 0) {
        confirmBox(
          "Confirm",
          `You have selected ${
            pairs.length * 2
          } accounts to unpair.\nAre you sure you want to unpair them?`,
          function () {
            if (pairs && pairs.length > 0) {
              ipc.send("remove-pairing", pairs);
            }
          },
          function () {}
        );
      }
    });

    $("#install_ea_file_location_btn").on("click", function(){
      $("#install_ea_file_input").click();
    });

    $("#install_ea_file_input").on("input", function(){      

      var immediate;
      confirmBox('Confirm',{
        onclose: ()=>{

          var obj = {
            file_name: this.files[0].path,
            immediate : immediate 
          }
          ipc.send("ea-install-file", obj);
          this.value = null;//clear it
        }
      },'<p>Do you want the EA to stop immediately in order to reload with the new installation?</p>'
      +'<p>If you click \'Yes\' the EA will stop immediately after installation so you can reload it to use the new installation.</p>'
      +'<p>If you click \'No\' the EA will keep running using the previous installation untill it gets discconnected from service.</p>',
      ()=>{
        immediate = true;
      },()=>{
        immediate = false;
      });

    })

    $("#install_ea_download_and_install_update_btn").on("click", function(){
    
      var immediate;
      confirmBox('Confirm',{
          onclose: ()=>{
            var obj = {
              immediate : immediate
            }
            
            if(HideProgresBarTimerId != -1){
              clearTimeout(HideProgresBarTimerId);
            }
          
            ipc.send("ea-download-install", obj);
      
          }
        },'<p>Do you want the EA to stop immediately in order to reload with the new installation?</p>'
        +'<p>If you click \'Yes\' the EA will stop immediately after installation so you can reload it to use the new installation.</p>'
        +'<p>If you click \'No\' the EA will keep running using the previous installation untill it gets discconnected from service.</p>',      
        ()=>{
          immediate = true;
        },()=>{
          immediate = false;
        });

      })

    });


    ipc.send("start-sync", true);

    ipc.send("get-app-config", AppConfig); //init with default

    ipc.on("log", function (event, arg) {
      console.log("log", arg);
      addInfoLog(arg);
    });

    ipc.on("sync-running", function (event, arg) {
      Version = arg.version;
      console.log("sync-running", `Version ${arg.version}`);

      addSuccessLog("Sync serivce running...");
    });

    ipc.on("sync-restart", function (event, arg) {
      console.log("sync-restart", arg);

      addSuccessLog("Sync serivce restart...");
    });

    ipc.on("sync-close", function (event, arg) {
      console.log("sync-close", arg);

      addInfoLog("Sync serivce closed!");
    });

    ipc.on("intro", function (event, arg) {
      console.log("intro", arg);
      if (arg.broker && arg.account_number && arg.version != Version) {
        var error = `EA version of [${arg.broker}, ${arg.account_number}] (${arg.version}) is incompatible with application version ${Version}. This application may not work properly!`;
        addErrorLog(error);
        alertify.error(error, 0);
        var is_cancel = true;
        if(!isVersionConflictReported){
          confirmBox(
            "Version Conflict",
            {
              onclose: function(){
                if(is_cancel){
                  alertBox('Warning', 'Please note that the appplication may not work properly due to existiong version conflict!');
                }
              }
            },
            "Version confict has been detected. This is mostly due to improper installations.\n\n"
            +"It is highly recommended you reinstall all packages to eliminate existing version conflict.\n\n"
            +"Do you want to reinstall all?",
            function () {
              is_cancel = false;
              if(HideProgresBarTimerId != -1){
                clearTimeout(HideProgresBarTimerId);
              }
              
              ipc.send("download-reinstall-all");
            },
            function () {
              is_cancel = true;
            }
          );
        }

        isVersionConflictReported = true;
      }

      if (setAccount(arg)) {
        refreshActionList(arg);
        pairingComponent();
        displaySymbolsConfiguration();
      }
    });

    ipc.on("paired", function (event, arg) {
      console.log("paired", arg);

      if (setAccount(arg)) {
        refreshPairedTable();
      }

      labelAccountStatus(arg, PAIRED);

      pairingComponent();
    });

    ipc.on("unpaired", function (event, arg) {
      console.log("unpaired", arg);

      addInfoLog(
        `[${arg[0].broker}, ${arg[0].account_number}] pairing removed!`
      );

      addInfoLog(
        `[${arg[1].broker}, ${arg[1].account_number}] pairing removed!`
      );

      removeAccount(arg[0]);
      removeAccount(arg[1]);

      refreshPairedTable();

      labelAccountStatus(arg[0], NOT_PAIRED);
      labelAccountStatus(arg[1], NOT_PAIRED);

      pairingComponent();
    });

    ipc.on("account-disconnect", function (event, arg) {
      console.log("account-disconnect", arg);

      addInfoLog(`[${arg.broker}, ${arg.account_number}]  is disconnected!`);

      labelAccountStatus(arg, DISCONNECTED);
    });

    ipc.on("order", function (event, arg) {
      console.log("order", arg);

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("account-info", function (event, arg) {
      if (setAccount(arg)) {
        //refreshPairedTable();//no need for now
      }
    });

    ipc.on("market-open", function (event, arg) {
      console.log("market-open", arg);

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("market-close", function (event, arg) {
      console.log("market-close", arg);

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("account-balance-changed", function (event, arg) {
      console.log("account-balance-changed", arg);

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("place-order-paired", function (event, arg) {
      console.log("place-order-paired", arg);

      addInfoLog(
        `Paired place orders of [${arg.broker}, ${arg.account_number}] and [${arg.peer.broker}, ${arg.peer.account_number}]`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("sending-place-order", function (event, arg) {
      console.log("sending-place-order", arg);

      addInfoLog(
        `Sending place order to [${arg.account.broker}, ${arg.account.account_number}]`
      );

      if (setAccount(arg.account)) {
        refreshPairedTable();
      }
    });

    ipc.on("sync-place-order-success", function (event, arg) {
      console.log("sync-place-order-success", arg);

      var msg = `[${arg.broker}, ${arg.account_number}] place order successful.`;

      addSuccessLog(msg);

      alertify.success(msg);

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("sync-place-order-fail", function (event, arg) {
      console.log("sync-place-order-fail", arg);

      var msg = `[${arg.broker}, ${arg.account_number}] place order failed! ${arg.last_error}`;

      addErrorLog(msg);

      alertify.error(msg);

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("sync-place-order-reject", function (event, error) {
      console.log("sync-place-order-reject", error);

      addErrorLog(error);

      alertify.error(error, 0);
    });

    ipc.on("sending-validate-place-order", function (event, arg) {
      console.log("sending-validate-place-order", arg);

      addInfoLog(
        `Validating place order for [${arg.account.broker}, ${arg.account.account_number}]`
      );

      setAccount(arg.account);
    });

    ipc.on("validate-place-order-succesful", function (event, arg) {
      console.log("", arg);

      var msg = `[${arg.broker}, ${arg.account_number}] validated place order succesfully!`;

      addSuccessLog(msg);

      setAccount(arg);
    });

    ipc.on("validate-place-order-remaining", function (event, arg) {
      console.log("", arg);

      var msg = `[${arg.broker}, ${arg.account_number}] validated place order remains one!`;

      addSuccessLog(msg);

      setAccount(arg);
    });

    ipc.on("validate-place-order-unknown-due-to-delete", function (event, arg) {
      console.log("", arg);

      var msg = `[${arg.broker}, ${arg.account_number}] order already deleted before validation result!`;

      addErrorLog(msg);

      setAccount(arg);
    });

    //retain this validation message
    ipc.on("validate-place-order-fail", function (event, arg) {
      console.log("validate-place-order-fail", arg);

      var msg = `[${arg.broker}, ${arg.account_number}] place order failed! ${arg.last_error}`;

      alertBox("Failed", msg);

      addErrorLog(msg);

      setAccount(arg);
    });

    ipc.on("sending-sync-copy", function (event, arg) {
      console.log("sending-sync-copy", arg);

      addInfoLog(
        `[${arg.account.broker}, ${arg.account.account_number}]  sending sync copy to [${arg.account.peer.broker}, ${arg.account.peer.account_number}]`
      );

      if (setAccount(arg.account)) {
        refreshPairedTable();
      }
    });

    ipc.on("sync-copy-success", function (event, arg) {
      console.log("sync-copy-success", arg);

      addSuccessLog(
        `[${arg.broker}, ${arg.account_number}] sync copy successful.`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("sync-copy-fail", function (event, arg) {
      console.log("sync-copy-fail", arg);

      addErrorLog(
        `[${arg.broker}, ${arg.account_number}] sync copy failed! ${arg.last_error}`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("sending-own-close", function (event, arg) {
      console.log("sending-own-close", arg);

      addInfoLog(
        `[${arg.account.broker}, ${arg.account.account_number}]  sending own close`
      );

      if (setAccount(arg.account)) {
        refreshPairedTable();
      }
    });

    ipc.on("own-close-success", function (event, arg) {
      console.log("own-close-success", arg);
      var account = arg.account;
      var force = arg.force;
      var reason = arg.reason;

      if (force) {
        addInfoLog(`[${account.broker}, ${account.account_number}] ${reason}`);
        alertify.success(
          `[${account.broker}, ${account.account_number}] ${reason}`,
          0
        );
      } else {
        addSuccessLog(
          `[${account.broker}, ${account.account_number}] own close successful.`
        );
      }

      if (setAccount(account)) {
        refreshPairedTable();
      }
    });

    ipc.on("own-close-fail", function (event, arg) {
      console.log("own-close-fail", arg);
      var account = arg.account;
      var force = arg.force;
      var ticket = arg.ticket;
      var msg = `[${account.broker}, ${account.account_number}] WARNING!!! Secure attempt to forcibly close order #${ticket} failed!`;

      if (force) {
        addErrorLog(msg);
        alertify.error(msg, 0);
      } else {
        addErrorLog(
          `[${account.broker}, ${account.account_number}] own close failed! ${account.last_error}`
        );
      }

      if (setAccount(account)) {
        refreshPairedTable();
      }
    });

    ipc.on("sending-sync-close", function (event, arg) {
      console.log("sending-sync-close", arg);

      addInfoLog(
        `[${arg.account.broker}, ${arg.account.account_number}]  sending sync close to [${arg.account.peer.broker}, ${arg.account.peer.account_number}]`
      );

      if (setAccount(arg.account)) {
        refreshPairedTable();
      }
    });

    ipc.on("sync-close-success", function (event, arg) {
      console.log("sync-close-success", arg);

      addSuccessLog(
        `[${arg.broker}, ${arg.account_number}] sync close successful.`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("sync-close-fail", function (event, arg) {
      console.log("sync-close-fail", arg);

      addErrorLog(
        `[${arg.broker}, ${arg.account_number}] sync close failed! ${arg.last_error}`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });
    
    ipc.on("lock-in-profit-success", function (event, arg) {
      console.log("lock-in-profit-success", arg);

      addSuccessLog(
        `[${arg.account.broker}, ${arg.account.account_number}] Lock In Profit: Trailing stop moved to ${arg.trailing_stop}`
      );

      if (setAccount(arg.account)) {
        refreshPairedTable();
      }
    });

    ipc.on("lock-in-profit-fail", function (event, arg) {
      console.log("lock-in-profit-fail", arg);

      addErrorLog(
        `[${arg.broker}, ${arg.account_number}] lock in profit failed! ${arg.last_error}`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("maximize-lock-in-profit-success", function (event, arg) {
      console.log("maximize-lock-in-profit-success", arg);

      addSuccessLog(
        `[${arg.account.broker}, ${arg.account.account_number}] Maximized Lock In Profit: Trailing stop moved to ${arg.trailing_stop}`
      );

      if (setAccount(arg.account)) {
        refreshPairedTable();
      }
    });

    ipc.on("maximize-lock-in-profit-fail", function (event, arg) {
      console.log("maximize-lock-in-profit-fail", arg);

      addErrorLog(
        `[${arg.broker}, ${arg.account_number}] maximize lock in profit failed! ${arg.last_error}`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });
    
    ipc.on("sending-modify-target", function (event, arg) {
      console.log("sending-modify-target", arg);

      addInfoLog(
        `[${arg.account.broker}, ${arg.account.account_number}]  sending sync modify target to [${arg.account.peer.broker}, ${arg.account.peer.account_number}]`
      );

      if (setAccount(arg.account)) {
        refreshPairedTable();
      }
    });

    ipc.on("modify-target-success", function (event, arg) {
      console.log("modify-target-success", arg);

      addSuccessLog(
        `[${arg.broker}, ${arg.account_number}] sync modify target successful.`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("modify-target-fail", function (event, arg) {
      console.log("modify-target-fail", arg);

      addErrorLog(
        `[${arg.broker}, ${arg.account_number}] sync modify target failed! ${arg.last_error}`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("sending-modify-stoploss", function (event, arg) {
      console.log("sending-modify-stoploss", arg);

      addInfoLog(
        `[${arg.account.broker}, ${arg.account.account_number}]  sending sync modify stoploss to [${arg.account.peer.broker}, ${arg.account.peer.account_number}]`
      );

      if (setAccount(arg.account)) {
        refreshPairedTable();
      }
    });

    ipc.on("modify-stoploss-success", function (event, arg) {
      console.log("modify-stoploss-success", arg);

      addSuccessLog(
        `[${arg.broker}, ${arg.account_number}] sync modify stoploss successful.`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("modify-stoploss-fail", function (event, arg) {
      console.log("modify-stoploss-fail", arg);

      addErrorLog(
        `[${arg.broker}, ${arg.account_number}] sync modify stoploss failed! ${arg.last_error}`
      );

      if (setAccount(arg)) {
        refreshPairedTable();
      }
    });

    ipc.on("app-config", function (event, arg) {
      if (arg) {
        mergeObjectTo(arg, AppConfig);
        displayGeneralSettings();
        displaySymbolsConfiguration();
        displayNotificationConfiguration();
      }
    });

    ipc.on("app-config-init-fail", function (event, arg) {
      console.log("app-config-init-fail", arg);

      var error = "Something went wrong while initializing app configuration.";

      addErrorLog(error);

      alertBox("App Config Error", error);
    });

    ipc.on("symbols-config-save-success", function (event, arg) {
      console.log("symbols-config-save-success", arg);

      mergeObjectTo(arg, AppConfig);

      displaySymbolsConfiguration(false, false, true);
    });

    ipc.on("symbols-config-save-fail", function (event, arg) {
      console.log("symbols-config-save-fail", arg);

      displaySymbolsConfiguration(false, false, false);
    });

    ipc.on(
      "notification-access-token-refresh-save-success",
      function (event, arg) {
        addInfoLog(`New notification access token saved.`);
      }
    );

    ipc.on(
      "notification-access-token-refresh-save-fail",
      function (event, arg) {
        addErrorLog(`Could not save new notification access token.`);
      }
    );

    ipc.on("notification-access-token-refresh", function (event, arg) {
      console.log("notification-access-token-refresh", arg);

      addInfoLog(`Notification access token refreshed.`);

      if (arg) {
        mergeObjectTo(arg, AppConfig);
        displayNotificationConfiguration();
      }
    });

    ipc.on("general-settings-save-success", function (event, arg) {
      console.log("general-settins-save-success", arg);

      mergeObjectTo(arg, AppConfig);
      displayGeneralSettings(true);
    });

    ipc.on("general-settings-save-fail", function (event, arg) {
      console.log("general-settings-save-fail", arg);

      displayGeneralSettings(false);
    });

    ipc.on("email-notification-config-save-success", function (event, arg) {
      console.log("email-notification-config-save-success", arg);

      mergeObjectTo(arg, AppConfig);
      displayNotificationConfiguration(true);
    });

    ipc.on("email-notification-config-save-fail", function (event, arg) {
      console.log("email-notification-config-save-fail", arg);

      displayNotificationConfiguration(false);
    });

    ipc.on(
      "email-notification-connection-verify-success",
      function (event, arg) {
        console.log("email-notification-connection-verify-success", arg);

        displayNotificationConnectionVerificationFeedback(true);
      }
    );

    ipc.on(
      "email-notification-connection-verify-fail",
      function (event, error) {
        console.log("email-notification-connection-verify-fail", error);

        displayNotificationConnectionVerificationFeedback(false, error);
      }
    );

    ipc.on("lot-stoploss-loss-at-stopout-result", function (event, arg) {
      console.log("lot-stoploss-loss-at-stopout-result");

      OnLotStoplossAndLossAtStopoutResult(arg);
    });
    ipc.on("show-place-order-warning-alert", function (event, arg) {
      confirmBox(
        "Warning",
        arg.warning,
        function () {
          ipc.send("accept-warning-place-order", arg.uuid);
        },
        function () {
          ipc.send("reject-warning-place-order", arg.uuid);
        }
      );
    });

    ipc.on("closing-all-trades", function (event, comment) {
      addInfoLog(comment);
      alertify.success(comment, 0);
    });

    ipc.on("place-order-trigger-rejected", function (event, msg) {
      addErrorLog(msg);
      alertify.error(msg, 0);
    });

    ipc.on("place-order-triggers", function (event, arg) {
      console.log("place-order-triggers");

      place_order_triggers = arg;
      displayPlaceOrderTriggers();
    });

    ipc.on("place-order-triggers-clear", function (event, message) {
      console.log("place-order-triggers-clear");

      place_order_triggers = [];

      alertify.success(message);

      displayPlaceOrderTriggers();
    });

    ipc.on("cancel-place-order-trigger-success", function (event, arg) {
      alertify.success("Place order trigger cancelled successfully.");

      place_order_triggers = arg;
      displayPlaceOrderTriggers();
    });

    ipc.on("cancel-place-order-trigger-fail", function (event, error) {
      alertify.error(error);
    });

    ipc.on("place-order-trigger-not-found", function (event, error) {
      alertify.error(error);
      displayPlaceOrderTriggers();
    });

    ipc.on("gui-prompt-box", function (event, arg) {

      var msg_html = `<div style="overflow:auto;">${arg.message}</div>`;

      promptBox(
        arg.title?arg.title:'Prompt',
        msg_html,
        '',
        function (evt, value) {
          ipc.send("gui-msg-box-feedback", 
          {
            id:arg.id,
            type:'prompt',
            action:'input',
            value: value
          });
        },
        function () {
          ipc.send("gui-msg-box-feedback", 
          {
            id:arg.id,
            type:'prompt',
            action:'cancel'
          });    
        });        
    });

    ipc.on("gui-confirm-box", function (event, arg) {
      var msg_html = `<div style="overflow:auto;">${arg.message}</div>`;
      confirmBox(
        arg.title?arg.title:'Confrim',
        msg_html,
        function (value) {
          ipc.send("gui-msg-box-feedback", 
          {
            id:arg.id,
            type:'confirm',
            action:'yes',
            value: value.text
          });
        },
        function () {
          ipc.send("gui-msg-box-feedback", 
          {
            id:arg.id,
            type:'confirm',
            action:'no'
          });    
        });
    });
    
    ipc.on("gui-alert-box", function (event, arg) {
      var msg_html = `<div style="overflow:auto;">${arg.message}</div>`;
      alertBox(arg.title?arg.title:'Alert', msg_html, function(){//onclose function
        ipc.send("gui-msg-box-feedback", 
          {
            id:arg.id,
            type:'alert',
          });
      });
    });
    
    
    ipc.on("gui-notify-box", function (event, arg) {

      var appearance = arg.type =='stm-notify' ? 'width: 100%; height: 100%; padding:10px; border-radius: 5px; background: teal; color: #eee;':''; 

      var msg_html = `<div style="overflow:auto; ${appearance}">${arg.message}</div>`;
      alertify.notify(msg_html, arg.type, arg.duration, function(){//onclose function
        ipc.send("gui-msg-box-feedback", 
          {
            id:arg.id,
            type:'notify',
          });
      });
    
    });

    
    ipc.on("reinstall-download-progress", function (event, progressObj) {
      handleDownloadProgress(progressObj);
    });

    
function dialogBox(obj) {
  var dialog = alertify[obj.type].apply(alertify, obj.params);

  dlgSetObj = {
    onclose: function () {
      alertCollection.splice(0, 1);
      nextDialog();
      if(typeof obj.settings.onclose === 'function'){
        obj.settings.onclose();
      }
    },
    resizable : !!(obj.settings.width && obj.settings.height)
  }; 

  var dlgSet = dialog.set(dlgSetObj);

  if(dlgSetObj.resizable){
    dlgSet.resizeTo(obj.settings.width, obj.settings.height);
  }

}

function nextDialog() {
  var obj = alertCollection[0];
  if (obj) {
    setImmediate(dialogBox, obj);
  }
}

function doBox(type, argus) {
  var params = [];
  var settings = {}
  var n=0;
  for (var i = 0; i < argus.length; i++) {
    if(typeof argus[i] === 'object'){
      settings = argus[i];
    }else{
      params[n] = argus[i];
      n++
    }
   
  }
  var alertObj = {
    type: type,
    params: params,
    settings: settings
  };

  alertCollection.push(alertObj);

  nextDialog();
}

function alertBox() {
  doBox("alert", arguments);
}

function confirmBox() {
  doBox("confirm", arguments);
}

function promptBox() {
  doBox("prompt", arguments);
}

function mergeObjectTo(fromObj, toObj) {
  for (var n in fromObj) {
    toObj[n] = fromObj[n];
  }

  return toObj;
}

//setTimeout(simulateDownloadProgerss, 5000);

function simulateDownloadProgerss(){


  var progressObj = {};

   progressObj["SyncTradeClinet.ex4"] = {
    name : "SyncTradeClinet.ex4",
    percent: 0,
    amount: 0,
    size : 20
  }

  progressObj["SyncTradeClinet5.ex5"] = {
    name : "SyncTradeClinet5.ex5",
    percent: 0,
    amount: 0,
    size : 40
  }

  progressObj["stm-setup.exe"] = {
    name : "stm-setup.exe",
    percent: 0,
    amount: 0,
    size : 100
  }


  setInterval(()=>{

    

    for(n in progressObj){
      var p = progressObj[n];

      var increase = true;

      if(p.percent >= 100){
        increase = false;
      }

      if(p.percent <= 0){
        increase = true;
      }

      //p.percent =  increase?  p.percent + 5 : p.percent - 5;
      
      
    }

    handleDownloadProgress(progressObj);


  }, 3000)

}

function handleDownloadProgress(progressObj){


  $("#install_ea_download_progress_ex4_label").hide();
  $("#install_ea_download_progress_ex4").hide();

  $("#install_ea_download_progress_ex5_label").hide();
  $("#install_ea_download_progress_ex5").hide();

  $("#install_ea_download_progress_exe_label").hide();
  $("#install_ea_download_progress_exe").hide();

  $("#install_ea_download_progress_segment").show(100);
  var done = true;
  for(n in progressObj){    
      var p = progressObj[n];

      if(p.percent < 100){
        done = false;
      }

      var label = p.percent < 100 
                      ? `<pre style="margin: 0; font-size: 16px  !important; font-family: 'Times New Roman';"><span style="font-size: 12px;">Dowloading...</span>  ${p.name}</pre>` 
                      : `<pre style="margin: 0; font-size: 16px  !important; font-family: 'Times New Roman';"><span style="font-size: 12px;">Dowloaded</span>  ${p.name}</pre>`;
      
      if(p.name.substring(p.name.length -4, p.name.length) === '.ex4'){
        $("#install_ea_download_progress_ex4_label").html(label);
        $("#install_ea_download_progress_ex4_label").show();
        $("#install_ea_download_progress_ex4").show();

        displayProgress("install_ea_download_progress_ex4", p);
      }else if(p.name.substring(p.name.length -4, p.name.length) === '.ex5'){    
        $("#install_ea_download_progress_ex5_label").html(label);
        $("#install_ea_download_progress_ex5_label").show();
        $("#install_ea_download_progress_ex5").show();
        displayProgress("install_ea_download_progress_ex5", p);
      }else if(p.name.substring(p.name.length -4, p.name.length) === '.exe'){
        $("#install_ea_download_progress_exe_label").html(label);
        $("#install_ea_download_progress_exe_label").show();
        $("#install_ea_download_progress_exe").show();
        displayProgress("install_ea_download_progress_exe", p);
      }

  }

  if(done === true && progressObj){
      HideProgresBarTimerId = setInterval(()=>{
        $("#install_ea_download_progress_segment").hide(50);
      }, 10000);
  }

}

function displayProgress(id, obj){
  $('#'+id).progress({    
    percent: obj.percent,
  });
  
}

function ComputeLotSize() {
    var pair = currentPair();
    if (!pair) {
      return;
    }
    var accountA = pair[0];
    var accountB = pair[1];

  var obj = {
    accountA: accountA,
    accountB: accountB
  }

  
  var symbol = document.getElementById(
    "place_order_dialog_symbols"
    ).value;

    if (!symbol) {
      alertBox("Invalid", "Please select symbol!");
      return false;
    }



  if (typeof AppConfig.symbol[symbol][accountA.broker] !== "object" 
      || typeof AppConfig.symbol[symbol][accountA.broker][accountA.account_number] !== "object" 
      || AppConfig.symbol[symbol][accountA.broker][accountA.account_number]['symbol'] === "") {
    alertBox(
      "Invalid",
      `Please configure the relative of ${symbol} for ${accountA.broker}!`
    );
    return false;
  }


  if (typeof AppConfig.symbol[symbol][accountB.broker] !== "object" 
      || typeof AppConfig.symbol[symbol][accountB.broker][accountB.account_number] !== "object" 
      || AppConfig.symbol[symbol][accountB.broker][accountB.account_number]['symbol'] === "") {
    alertBox(
      "Invalid",
      `Please configure the relative of ${symbol} for ${accountB.broker}!`
    );
    return false;
  }


  var match_chart_symbol = generalSymbol(accountA, accountB);
          
  if (!match_chart_symbol) {
    alertBox("Invalid", `Chart symbols on both account do not correspond with each other or probably not properly configured in symbol settings!`);
    return false;
  }


  if (symbol !== match_chart_symbol) {
    alertBox("Invalid", `The selected symbol ${symbol}) does not correspond with the chart symbol.\nMake sure the chart symbols on both accounts are correspond with each other and properly configured in symbol settings!`);
    return false;
  }

  confirmBox('Compute Lot Size',
  {
    width: '70%',
    height: '95%',
    onclose : function(){
      var lot_size_a = document.getElementById('compute_lot_size_dialog_lot_size_for_account_a').value;
      var lot_size_b = document.getElementById('compute_lot_size_dialog_lot_size_for_account_b').value;
  
      var sl_pips_a = document.getElementById('compute_lot_size_dialog_sl_pips_for_account_a').value;
      var sl_pips_b = document.getElementById('compute_lot_size_dialog_sl_pips_for_account_b').value;
  
      if (lot_size_a < 0) {        
        alertBox("Invalid", `Invalid lot size!\nLot size can not be negative: ${lot_size_a}`);
        document.getElementById('place_order_dialog_lot_size_for_account_a').value = 0;
        document.getElementById('place_order_dialog_lot_size_for_account_b').value = 0;
        document.getElementById('place_order_dialog_trade_count_due_to_lot_limit').value = 0;
      }
  
      if (lot_size_b < 0) {        
        alertBox("Invalid", `Invalid lot size!\nLot size can not be negative: ${lot_size_b}`);
        document.getElementById('place_order_dialog_lot_size_for_account_a').value = 0;
        document.getElementById('place_order_dialog_lot_size_for_account_b').value = 0;
        document.getElementById('place_order_dialog_trade_count_due_to_lot_limit').value = 0;
      }
  
      if (sl_pips_a < 0) {        
        alertBox("Invalid", `Invalid lot size due to wrong stoploss!\nStoploss pips can not be negative: ${sl_pips_a}`);
        document.getElementById('place_order_dialog_lot_size_for_account_a').value = 0;
        document.getElementById('place_order_dialog_lot_size_for_account_b').value = 0;
        document.getElementById('place_order_dialog_trade_count_due_to_lot_limit').value = 0;
      }
  
      if (sl_pips_b < 0) {        
        alertBox("Invalid", `Invalid lot size due to wrong stoploss!\nStoploss pips can not be negative: ${sl_pips_b}`);
        document.getElementById('place_order_dialog_lot_size_for_account_a').value = 0;
        document.getElementById('place_order_dialog_lot_size_for_account_b').value = 0;
        document.getElementById('place_order_dialog_trade_count_due_to_lot_limit').value = 0;
      }
      
    }
  },
  computeLotSizeHTML(obj),
  function(){
  
    var lot_size_a = document.getElementById('compute_lot_size_dialog_lot_size_for_account_a').value;
    var lot_size_b = document.getElementById('compute_lot_size_dialog_lot_size_for_account_b').value;

    document.getElementById('place_order_dialog_lot_size_for_account_a').value = lot_size_a;

    document.getElementById('place_order_dialog_lot_size_for_account_b').value = lot_size_b;

    //determine number of trade split
    var max_lot_size_a = accountA.chart_symbol_max_lot_size;
    var max_lot_size_b = accountB.chart_symbol_max_lot_size;

    var trade_split_count_a = Math.ceil(lot_size_a / max_lot_size_a); // round up to the nearest integer
    var trade_split_count_b = Math.ceil(lot_size_b / max_lot_size_b); // round up to the nearest integer

    //however if the lot size is exactly equal to the max allowed then split into 2 - we do not 
    //know if brokesr will allow trade for now if exactly equal to the max

    if(lot_size_a == max_lot_size_a){
      trade_split_count_a = 2; //remove it block if we later confirm the brokers allow trade if the lot is exactly equal to the max allowed
    }

    if(lot_size_b == max_lot_size_b){
      trade_split_count_b = 2;//remove it block if we later confirm the brokers allow trade if the lot is exactly equal to the max allowed
    }

    //pick the higher split count
    var trade_split_count = trade_split_count_a > trade_split_count_b ? trade_split_count_a : trade_split_count_b;

    document.getElementById('place_order_dialog_trade_count_due_to_lot_limit').value = trade_split_count;


  }, function(){})

}



function PlaceOrder() {
  var pair = currentPair();
  if (!pair) {
    return;
  }
  var accountA = pair[0];
  var accountB = pair[1];

  var selected_account_for_buy;

  $("#place_order_dialog_subheading").html(
    `Sending instant order to account ${accountA.account_number} of ${accountA.broker} and ${accountB.account_number} of ${accountB.broker}`
  );

  $("#place_order_dialog")
    .modal({
      closable: false,
      onDeny: function () {},
      onApprove: function () {
        var obj = {};

        var account_for_buy_value = $("#place_order_dialog_accounts").dropdown(
          "get value"
        );

        if (!account_for_buy_value) {
          alertBox("Invalid", "Please select account for buy side!");
          return false;
        }

        var trigger_type = document.getElementById(
          "place_order_dialog_trigger"
        ).value;
        var trigger_price = document.getElementById(
          "place_order_dialog_trigger_price"
        ).value;
        var max_percent_diff_in_account_balances =
          document.getElementById(
            "place_order_dialog_percentage_difference_in_account_balances"
          ).value || Infinity;

        var symbol = document.getElementById(
          "place_order_dialog_symbols"
        ).value;

        var trade_split_count = document.getElementById('place_order_dialog_trade_count_due_to_lot_limit').value

        var lot_size_a = parseFloat((document.getElementById(
          "place_order_dialog_lot_size_for_account_a"
        ).value / trade_split_count).toFixed(2)); //divided by the number of trades

        var lot_size_b = parseFloat((document.getElementById(
          "place_order_dialog_lot_size_for_account_b"
        ).value / trade_split_count).toFixed(2)); //divided by the number of trades


        if (!symbol) {
          alertBox("Invalid", "Please select symbol!");
          return false;
        }

        var match_chart_symbol = generalSymbol(accountA, accountB);

        
        if (!match_chart_symbol) {
          alertBox("Invalid", `Chart symbols on both account do not correspond with each other or probably not properly configured in symbol settings!`);
          return false;
        }

        
        if (symbol !== match_chart_symbol) {
          alertBox("Invalid", `The selected symbol ${symbol}) does not correspond with the chart symbol.\nMake sure the chart symbols on both accounts are correspond with each other and properly configured in symbol settings!`);
          return false;
        }

        if (!lot_size_a) {
          lot_size_a = 0;
        }

        if (!lot_size_b) {
          lot_size_b = 0;
        }

        if (
          (lot_size_a == 0 && lot_size_b != 0) ||
          (lot_size_a != 0 && lot_size_b == 0)
        ) {
          alertBox(
            "Invalid",
            `Not allowed! Either specify lot size for both accounts or none for both (where the EA lot size settings will be used).`
          );

          return false;
        }

        var split = account_for_buy_value.split(",");
        var broker = split[0].trim();
        var account_number = split[1].trim();

        var account_buy = getAccount(broker, account_number);

        var broker_a = document.getElementById(
          "place_order_dialog_lot_size_for_account_a"
        ).dataset.broker;
        var account_number_a = document.getElementById(
          "place_order_dialog_lot_size_for_account_a"
        ).dataset.accountNumber;

        var broker_b = document.getElementById(
          "place_order_dialog_lot_size_for_account_b"
        ).dataset.broker;
        var account_number_b = document.getElementById(
          "place_order_dialog_lot_size_for_account_b"
        ).dataset.accountNumber;

        var account_a = getAccount(broker_a, account_number_a);
        var account_b = getAccount(broker_b, account_number_b);

        obj.account_buy = account_buy;
        obj.account_a = account_a;
        obj.account_b = account_b;
        obj.symbol = symbol;
        obj.lot_size_a = lot_size_a;
        obj.lot_size_b = lot_size_b;
        obj.trade_split_count = trade_split_count;
        obj.trigger_type = trigger_type;
        obj.trigger_price = trigger_price;
        obj.max_percent_diff_in_account_balances =
          max_percent_diff_in_account_balances;

        if (obj.trigger_type != "Instant now" && !obj.trigger_price) {
          alertBox("Invalid Price", "Please enter valid trigger price!");
          return false;
        }

        if (!AppConfig.symbol[symbol]) {
          alertBox("Not Found", "Relative symbol not found!");
          return false;
        }
        
        

        if (typeof AppConfig.symbol[symbol][broker] !== "object" 
            || typeof AppConfig.symbol[symbol][broker][account_number] !== "object" 
            ||AppConfig.symbol[symbol][broker][account_number]['symbol'] === "")  {
          alertBox(
            "Invalid",
            `Please configure the relative of ${symbol} for ${broker}!`
          );
          return false;
        }

        var peer_account = getPeerAccount(broker, account_number);
        
        if (!peer_account) {
          alertBox("Error", `Could not find peer account for ${broker}, ${account_number}`);
          return false;
        }

        var peer_broker = peer_account.broker;
        var peer_account_number = peer_account.account_number;
        

        if (typeof AppConfig.symbol[symbol][peer_broker] !== "object" 
        || typeof AppConfig.symbol[symbol][peer_broker][peer_account_number] !== "object" 
        || AppConfig.symbol[symbol][peer_broker][peer_account_number]['symbol'] === ""){
          alertBox(
            "Attention",
            `Please configure the relative of ${symbol} for ${peer_broker}!`
          );
          return false;
        }

        if (typeof AppConfig.spread[symbol] === 'undefined'
         || AppConfig.spread[symbol] === null 
         || AppConfig.spread[symbol] < 0) {
          alertBox(
            "Invalid",
            `Spread for ${symbol} must be at least zero!\nHint: refer to Symbols Configuration to set value at least zero.`
          );
          return false;
        }

        confirmBox(
          "Confirm",
          confirmTradeEntryHTML(obj),
          function () {
            if (obj.trigger_type == "Instant now") {
              ipc.send("place-order", obj);
            } else {
              ipc.send("place-order-trigger", obj);
            }
            $("#place_order_dialog").modal("hide");
          },
          function () {}
        );

        return false;
      },
      onShow: function () {

        document.getElementById('show_compute_lot_size_dialog').onclick = ()=>{

          var account_for_buy_value = $("#place_order_dialog_accounts").dropdown(
            "get value"
          );
    
          if (!account_for_buy_value) {
            alertBox("Invalid", "Please select account for buy side!");
            return;
          }
    
          ComputeLotSize();
        }


        $("#place_order_dialog_accounts").dropdown();

        document.getElementById(
          "place_order_dialog_account_a_content"
        ).dataset.value = `${accountA.broker}, ${accountA.account_number}`;
        document.getElementById(
          "place_order_dialog_account_a_content"
        ).dataset.broker = `${accountA.broker}`;
        document.getElementById(
          "place_order_dialog_account_a_content"
        ).dataset.accountNumber = `${accountA.account_number}`;
        $("#place_order_dialog_account_a_image").attr(
          "src",
          `${accountA.icon_file}`
        );
        $("#place_order_dialog_account_a_label").html(
          `${accountA.broker}, ${accountA.account_number}`
        );

        document.getElementById(
          "place_order_dialog_account_b_content"
        ).dataset.value = `${accountB.broker}, ${accountB.account_number}`;
        document.getElementById(
          "place_order_dialog_account_b_content"
        ).dataset.broker = `${accountB.broker}`;
        document.getElementById(
          "place_order_dialog_account_b_content"
        ).dataset.accountNumber = `${accountB.account_number}`;
        $("#place_order_dialog_account_b_image").attr(
          "src",
          `${accountB.icon_file}`
        );
        $("#place_order_dialog_account_b_label").html(
          `${accountB.broker}, ${accountB.account_number}`
        );

        document.getElementById("place_order_dialog_symbols").innerHTML =
          placeOrderDropdownSymbolsHTML();

        $("#place_order_dialog_label_lot_size_for_account_a").html(
          `${accountA.broker}, ${accountA.account_number}`
        );
        $("#place_order_dialog_label_lot_size_for_account_b").html(
          `${accountB.broker}, ${accountB.account_number}`
        );
        $("#place_order_dialog_label_trade_count_due_to_lot_limit").html(
          `${accountA.chart_symbol_max_lot_size < accountB.chart_symbol_max_lot_size
            ?accountA.chart_symbol_max_lot_size
            : accountB.chart_symbol_max_lot_size}`
        );

        document.getElementById(
          "place_order_dialog_lot_size_for_account_a"
        ).dataset.broker = `${accountA.broker}`;
        document.getElementById(
          "place_order_dialog_lot_size_for_account_a"
        ).dataset.accountNumber = `${accountA.account_number}`;

        document.getElementById(
          "place_order_dialog_lot_size_for_account_b"
        ).dataset.broker = `${accountB.broker}`;
        document.getElementById(
          "place_order_dialog_lot_size_for_account_b"
        ).dataset.accountNumber = `${accountB.account_number}`;

        document.getElementById("place_order_dialog_trigger_price").value =
          accountA.chart_market_price;

        var match_chart_symbol = generalSymbol(accountA, accountB);

        document.getElementById("place_order_dialog_symbols").value = match_chart_symbol;

      },
    })
    .modal("show");
}

function confirmTradeEntryHTML(obj) {
  var html = `
                <i>Please confirm again if the following entries you entered is correct.</i>

                <table class="ui compact celled definition structured table">
                    <thead class="full-width">
                            <tr>
                                <th colspan="1"></th>
                                <th>
                                        <h4 class="ui image header">
                                            <img src="${
                                              obj.account_a.icon_file
                                            }">
                                            <div class="content">
                                                ${obj.account_a.broker}
                                                <div class="sub header">
                                                    ${
                                                      obj.account_a
                                                        .account_number
                                                    } - ${accountTypeText(
    obj.account_a
  )} on ${obj.account_a.platform_type}
                                                </div>
                                            </div>
                                        </h4>
                                </th>

                                <th>
                                        <h4 class="ui image header">
                                            <img src="${
                                              obj.account_b.icon_file
                                            }">
                                            <div class="content">
                                                ${obj.account_b.broker}
                                                <div class="sub header">
                                                    ${
                                                      obj.account_b
                                                        .account_number
                                                    } - ${accountTypeText(
    obj.account_b
  )} on ${obj.account_b.platform_type}
                                                </div>
                                            </div>
                                        </h4>

                                </th>
                          </tr>

                          <tr>
                            <th>TRIGGER CONDITION</th>
                            <th colspan="2">${obj.trigger_type}</th>
                          </tr>
                          <tr>
                            <th>TRIGGER PRICE</th>
                            <th colspan="2" ${
                              obj.trigger_type == "Instant now" ||
                              obj.trigger_type ==
                                "Instant when both accounts have credit bonuses"
                                ? 'style="font-style: italic;"'
                                : ""
                            }>${
    obj.trigger_type == "Instant now" ||
    obj.trigger_type == "Instant when both accounts have credit bonuses"
      ? "At market price"
      : obj.trigger_price
  }</th>
                          </tr>
                          <tr>
                            <th>SYMBOL</th>
                            <th colspan="2">${obj.symbol}</th>
                          </tr>
                          <tr>
                            <th>MAX. ACCOUNT BALANCES DIFF. %</th>
                            <th colspan="2">${
                              obj.max_percent_diff_in_account_balances
                            }</th>
                          </tr>
                    </thead>
                    <tbody>
                          <tr>
                            <td>POSITION</td>
                            <td>${
                              obj.account_a.broker == obj.account_buy.broker &&
                              obj.account_a.account_number ==
                                obj.account_buy.account_number
                                ? "BUY"
                                : "SELL"
                            }</td>
                            <td>${
                              obj.account_a.broker == obj.account_buy.broker &&
                              obj.account_a.account_number ==
                                obj.account_buy.account_number
                                ? "SELL"
                                : "BUY"
                            }</td>
                          </tr>
                          <tr>
                            <td>LOT SIZE</td>
                            <td>${obj.lot_size_a} ${obj.trade_split_count > 1? "( x"+obj.trade_split_count + " )":""}</td>
                            <td>${obj.lot_size_b} ${obj.trade_split_count > 1? "( x"+obj.trade_split_count + " )":""}</td>
                          </tr>
                    </tbody>
                    <tfoot class="full-width">
                    </tfoot>
                 </table>
            `;

  return html;
}

function computeLotSizeHTML(obj){
  var accountA = obj.accountA;
  var accountB = obj.accountB;

  return `
  
          <form class="ui form">

              <div class="two fields">
                <div class="field">
                    <label style="text-align: right;"><pre style="display: inline;">Symbol : </pre>${generalSymbol(accountA, accountB)}</label>
                </div>
                <div class="field">
                    <label style="text-align: right;"><pre style="display: inline;"> Total Account Balance : </pre>${(accountA.account_balance + accountB.account_balance).toFixed(2) } ${accountA.account_currency}</label>
                </div>
              </div>

              <div class="two fields" style="margin-bottom:-5px !important;">
                <div class="field">
                  <label style="margin-bottom: 10px;">Acct Bal. <i>${accountA.account_balance}</i></label>
                </div>
                <div class="field">
                  <label style="margin-bottom: 10px;">Acct Bal. <i>${accountB.account_balance}</i></label>
                </div>
              </div>  

              <div class="two fields">
                  <div class="field" id ="compute_lot_size_dialog_wrapper_lot_size_for_account_a">                      
                      <label>Lot size for <i id="compute_lot_size_dialog_label_lot_size_for_account_a">${accountA.broker}, ${accountA.account_number}</i></label>
                      <input oninput="onComputeLotSizeChange(this)" id="compute_lot_size_dialog_lot_size_for_account_a" type="number" min="0" data-broker="${accountA.broker}" data-account-number="${accountA.account_number}">
                  </div>
                  <div class="field" id ="compute_lot_size_dialog_wrapper_lot_size_for_account_b">
                      <label>Lot size for  <i id="compute_lot_size_dialog_label_lot_size_for_account_b">${accountB.broker}, ${accountB.account_number}</i></label>
                      <input oninput="onComputeLotSizeChange(this)" id="compute_lot_size_dialog_lot_size_for_account_b" type="number" min="0" data-broker="${accountB.broker}" data-account-number="${accountB.account_number}">
                  </div>
              </div>

              
              <div class="two fields">
                  <div class="field" id ="compute_lot_size_dialog_wrapper_sl_pips_for_account_a">
                      <label>SL pips for <i id="compute_lot_size_dialog_label_sl_pips_for_account_a">${accountA.broker}, ${accountA.account_number}</i></label>
                      <input oninput="onComputeSLPipsChange(this)" id="compute_lot_size_dialog_sl_pips_for_account_a" type="number" min="0" data-broker="${accountA.broker}" data-account-number="${accountA.account_number}">
                  </div>
                  <div class="field" id ="compute_lot_size_dialog_wrapper_sl_pips_for_account_b">
                      <label>SL pips for  <i id="compute_lot_size_dialog_label_sl_pips_for_account_b">${accountB.broker}, ${accountB.account_number}</i></label>
                      <input oninput="onComputeSLPipsChange(this)" id="compute_lot_size_dialog_sl_pips_for_account_b" type="number" min="0" data-broker="${accountB.broker}" data-account-number="${accountB.account_number}">
                  </div>
              </div>

              <div class="two fields">
                <div class="field">                      
                  <label><pre style="display: inline;">spread cost             : </pre><strong id="compute_lot_size_dialog_label_spread_cost_for_account_a"></strong></label>                      
                  <label><pre style="display: inline;">commssion               : </pre><strong id="compute_lot_size_dialog_label_commission_for_account_a"></strong></label>                      
                  <label><pre style="display: inline;">swap cost per day       : </pre><strong id="compute_lot_size_dialog_label_swap_cost_per_day_for_account_a"></strong></label>                                            
                  <label><pre style="display: inline;">profit                  : </pre><strong id="compute_lot_size_dialog_label_profit_for_account_a"></strong></label>
                  <label><pre style="display: inline;">crash balance           : </pre><strong id="compute_lot_size_dialog_label_crash_balance_for_account_a"></strong> <i id="compute_lot_size_dialog_label_negative_balance_protection_for_account_a" style="font-size:10px; margin-left: 10px;">(-ve bal. protection)</i></label>
                  <label><pre style="display: inline;">win balance             : </pre><strong id="compute_lot_size_dialog_label_win_balance_for_account_a"></strong></label>
                  <label><pre style="display: inline;">Theoritical Net balance : </pre><strong id="compute_lot_size_dialog_label_theoritical_net_balance_for_account_a"></strong></label>
                  <label><pre style="display: inline;">Actual Net balance      : </pre><strong id="compute_lot_size_dialog_label_actual_net_balance_for_account_a"></strong></label>
                </div>
                <div class="field">                      
                  <label><pre style="display: inline;">spread cost             : </pre><strong id="compute_lot_size_dialog_label_spread_cost_for_account_b"></strong></label>                      
                  <label><pre style="display: inline;">commssion               : </pre><strong id="compute_lot_size_dialog_label_commission_for_account_b"></strong></label>
                  <label><pre style="display: inline;">swap cost per day       : </pre><strong id="compute_lot_size_dialog_label_swap_cost_per_day_for_account_b"></strong></label>                      
                  <label><pre style="display: inline;">profit                  : </pre><strong id="compute_lot_size_dialog_label_profit_for_account_b"></strong></label>
                  <label><pre style="display: inline;">crash balance           : </pre><strong id="compute_lot_size_dialog_label_crash_balance_for_account_b"></strong> <i id="compute_lot_size_dialog_label_negative_balance_protection_for_account_b" style="font-size:10px; margin-left: 10px;">(-ve bal. protection)</i></label>
                  <label><pre style="display: inline;">win balance             : </pre><strong id="compute_lot_size_dialog_label_win_balance_for_account_b"></strong></label>
                  <label><pre style="display: inline;">Theoritical net balance : </pre><strong id="compute_lot_size_dialog_label_theoritical_net_balance_for_account_b"></strong></label>
                  <label><pre style="display: inline;">Actual net balance      : </pre><strong id="compute_lot_size_dialog_label_actual_net_balance_for_account_b"></strong></label>
                </div>
              </div>

              <hr/>
              <div class="field">
                <label>NOTE:</label>
                <label>Theoritical net balance is the sum of the account balance, win balance of one acccount and the crash balance of the other - spread and commission cost not included</label>
                <label>Actual net balance is the sum of the account balance, win balance of one account and the crash balance of the other, <i>less</i> spread and commission cost</label>
              </div>
          </form>`;
}

function onComputeLotSizeChange(el){
  sendComputeSlPipsLot(el, 'lot')
}

function onComputeSLPipsChange(el){
  sendComputeSlPipsLot(el, 'sl')
}

function sendComputeSlPipsLot(el, type){
  var obj = {
    broker: el.dataset.broker,
    account_number: el.dataset.accountNumber
  }


  
  var account_for_buy_value = $("#place_order_dialog_accounts").dropdown(
    "get value"
  );

  if (!account_for_buy_value) {
    alertBox("Invalid", "Please select account for buy side!");
    return false;
  }

  var split = account_for_buy_value.split(",");
  var broker_buy = split[0].trim();
  var account_number_buy = split[1].trim();

  var account = getAccount(obj.broker, obj.account_number);

  if(account.broker === broker_buy && account.account_number === account_number_buy){
    obj.position = 'BUY';
  }else { //NOTE: Do not use refere ce account.peer here since it may be undefined and cause undefined exception 
    obj.position = 'SELL';
  }

  if(type == 'lot'){
    obj.lot_size = el.value;
  }else if(type === 'sl'){
    obj.stoploss_pips = el.value;
  }
  
  ipc.send("compute-lot-stoploss-loss-at-stopout", obj);
}

function generalSymbol(accountA, accountB) {

  for (var symbol in AppConfig.symbol) {
    var symbolsObj = AppConfig.symbol[symbol];

    if(typeof symbolsObj[accountA.broker] !== 'object'
        || typeof symbolsObj[accountB.broker] !== 'object'
        || typeof symbolsObj[accountA.broker][accountA.account_number] !== 'object'
        || typeof symbolsObj[accountB.broker][accountB.account_number] !== 'object'){
       continue;
     }

    if (
      (symbolsObj[accountA.broker][accountA.account_number]['symbol'] === accountA.chart_symbol)
       && (symbolsObj[accountB.broker][accountB.account_number]['symbol'] === accountB.chart_symbol)
    ) {
      return symbol;
    }
  }
  return "";
}

function OnTriggerSelected(el) {
  var trgEl = document.getElementById("place_order_dialog_trigger_price");
  if (el.value == "Instant now") {
    trgEl.disabled = true;
  } else {
    trgEl.disabled = false;
  }
}

function OnLotStoplossAndLossAtStopoutResult(obj){


  var broker_a = document.getElementById(
    "compute_lot_size_dialog_lot_size_for_account_a"
  ).dataset.broker;
  var account_number_a = document.getElementById(
    "compute_lot_size_dialog_lot_size_for_account_a"
  ).dataset.accountNumber;

  var broker_b = document.getElementById(
    "compute_lot_size_dialog_lot_size_for_account_b"
  ).dataset.broker;
  var account_number_b = document.getElementById(
    "compute_lot_size_dialog_lot_size_for_account_b"
  ).dataset.accountNumber;

  if(obj.account.broker === broker_a 
    && obj.account.account_number === account_number_a){

      if(parseFloat(obj.lot_size) < 0){
        $('#compute_lot_size_dialog_wrapper_lot_size_for_account_a').addClass('error');
      }else{
        $('#compute_lot_size_dialog_wrapper_lot_size_for_account_a').removeClass('error');
      }
    
      if(parseFloat(obj.stoploss_pips) < 0){
        $('#compute_lot_size_dialog_wrapper_sl_pips_for_account_a').addClass('error');
      }else{
        $('#compute_lot_size_dialog_wrapper_sl_pips_for_account_a').removeClass('error');
      }    

      document.getElementById("compute_lot_size_dialog_lot_size_for_account_a").value = obj.lot_size;
      document.getElementById("compute_lot_size_dialog_sl_pips_for_account_a").value = obj.stoploss_pips;

      document.getElementById("compute_lot_size_dialog_label_spread_cost_for_account_a").innerHTML = obj.spread_cost;
      document.getElementById("compute_lot_size_dialog_label_commission_for_account_a").innerHTML = obj.is_commission_known ? obj.commission : 'unknown';
      document.getElementById("compute_lot_size_dialog_label_commission_for_account_a").style.fontStyle = obj.is_commission_known ? 'normal' : 'italic';
      document.getElementById("compute_lot_size_dialog_label_crash_balance_for_account_a").innerHTML = obj.crash_balance < 0 ? 0 : obj.crash_balance;
      document.getElementById("compute_lot_size_dialog_label_negative_balance_protection_for_account_a").style.visibility = obj.crash_balance < 0 ? 'visible' : 'hidden';
      document.getElementById("compute_lot_size_dialog_label_swap_cost_per_day_for_account_a").innerHTML = obj.swap_cost_per_day;
            
  }

  
  if(obj.account.broker === broker_b 
    && obj.account.account_number === account_number_b){

      if(parseFloat(obj.lot_size) < 0){
        $('#compute_lot_size_dialog_wrapper_lot_size_for_account_b').addClass('error');
      }else{
        $('#compute_lot_size_dialog_wrapper_lot_size_for_account_b').removeClass('error');
      }
    
      if(parseFloat(obj.stoploss_pips) < 0){
        $('#compute_lot_size_dialog_wrapper_sl_pips_for_account_b').addClass('error');
      }else{
        $('#compute_lot_size_dialog_wrapper_sl_pips_for_account_b').removeClass('error');
      }    

      document.getElementById("compute_lot_size_dialog_lot_size_for_account_b").value = obj.lot_size;
      document.getElementById("compute_lot_size_dialog_sl_pips_for_account_b").value = obj.stoploss_pips;
      
      document.getElementById("compute_lot_size_dialog_label_spread_cost_for_account_b").innerHTML = obj.spread_cost;
      document.getElementById("compute_lot_size_dialog_label_commission_for_account_b").innerHTML = obj.is_commission_known ? obj.commission : 'unknown';
      document.getElementById("compute_lot_size_dialog_label_commission_for_account_b").style.fontStyle = obj.is_commission_known ? 'normal' : 'italic';      
      document.getElementById("compute_lot_size_dialog_label_crash_balance_for_account_b").innerHTML = obj.crash_balance < 0 ? 0 : obj.crash_balance;
      document.getElementById("compute_lot_size_dialog_label_negative_balance_protection_for_account_b").style.visibility = obj.crash_balance < 0 ? 'visible' : 'hidden';
      document.getElementById("compute_lot_size_dialog_label_swap_cost_per_day_for_account_b").innerHTML = obj.swap_cost_per_day;

  }


  var stoploss_pips_a = document.getElementById("compute_lot_size_dialog_sl_pips_for_account_a").value || 0;
  var stoploss_pips_b = document.getElementById("compute_lot_size_dialog_sl_pips_for_account_b").value || 0;
  
  var lot_size_a = document.getElementById("compute_lot_size_dialog_lot_size_for_account_a").value || 0;
  var lot_size_b = document.getElementById("compute_lot_size_dialog_lot_size_for_account_b").value || 0;

  var target_profit_a = parseFloat((lot_size_a * stoploss_pips_b).toFixed(2)); 
  var target_profit_b = parseFloat((lot_size_b * stoploss_pips_a).toFixed(2)); 

  document.getElementById("compute_lot_size_dialog_label_profit_for_account_a").innerHTML = target_profit_a;

  
  document.getElementById("compute_lot_size_dialog_label_profit_for_account_b").innerHTML = target_profit_b;

  var crash_balance_a = (document.getElementById("compute_lot_size_dialog_label_crash_balance_for_account_a").innerHTML - 0) || 0;
  var crash_balance_b = (document.getElementById("compute_lot_size_dialog_label_crash_balance_for_account_b").innerHTML - 0) || 0;

  var spread_cost_a = (document.getElementById("compute_lot_size_dialog_label_spread_cost_for_account_a").innerHTML - 0) || 0;
  var spread_cost_b = (document.getElementById("compute_lot_size_dialog_label_spread_cost_for_account_b").innerHTML - 0) || 0;

  //var total_spread_cost = spread_cost_a + spread_cost_b;

  var commission_a = document.getElementById("compute_lot_size_dialog_label_commission_for_account_a").innerHTML;
  commission_a = isNaN(commission_a) ? 0 : (commission_a - 0);
  var commission_b = document.getElementById("compute_lot_size_dialog_label_commission_for_account_b").innerHTML;
  commission_b = isNaN(commission_b) ? 0 : (commission_b - 0);

  //var total_commission = commission_a + commission_b;

  if(obj.account.broker === broker_a 
    && obj.account.account_number === account_number_a){
        document.getElementById("compute_lot_size_dialog_label_win_balance_for_account_a").innerHTML = parseFloat((obj.account.account_balance + target_profit_a).toFixed(2));
        document.getElementById("compute_lot_size_dialog_label_theoritical_net_balance_for_account_a").innerHTML = parseFloat((obj.account.account_balance + target_profit_a + crash_balance_b).toFixed(2));
        document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_a").innerHTML = parseFloat((obj.account.account_balance + target_profit_a + crash_balance_b - Math.abs(spread_cost_a)).toFixed(2) - Math.abs(commission_a).toFixed(2));
        
    }

  if(obj.account.peer.broker === broker_a 
    && obj.account.peer.account_number === account_number_a){
        document.getElementById("compute_lot_size_dialog_label_win_balance_for_account_a").innerHTML = parseFloat((obj.account.peer.account_balance + target_profit_a).toFixed(2));
        document.getElementById("compute_lot_size_dialog_label_theoritical_net_balance_for_account_a").innerHTML = parseFloat((obj.account.peer.account_balance + target_profit_a + crash_balance_b).toFixed(2));
        document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_a").innerHTML = parseFloat((obj.account.peer.account_balance + target_profit_a + crash_balance_b - Math.abs(spread_cost_a)).toFixed(2) - Math.abs(commission_a).toFixed(2));
    }


  if(obj.account.broker === broker_b 
    && obj.account.account_number === account_number_b){
          document.getElementById("compute_lot_size_dialog_label_win_balance_for_account_b").innerHTML = parseFloat((obj.account.account_balance + target_profit_b).toFixed(2));
          document.getElementById("compute_lot_size_dialog_label_theoritical_net_balance_for_account_b").innerHTML = parseFloat((obj.account.account_balance + target_profit_b + crash_balance_a).toFixed(2));
          document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_b").innerHTML = parseFloat((obj.account.account_balance + target_profit_b + crash_balance_a - Math.abs(spread_cost_b)).toFixed(2) - Math.abs(commission_b).toFixed(2));
    }
  
  if(obj.account.peer.broker === broker_b 
    && obj.account.peer.account_number === account_number_b){
          document.getElementById("compute_lot_size_dialog_label_win_balance_for_account_b").innerHTML = parseFloat((obj.account.peer.account_balance + target_profit_b).toFixed(2));
          document.getElementById("compute_lot_size_dialog_label_theoritical_net_balance_for_account_b").innerHTML = parseFloat((obj.account.peer.account_balance + target_profit_b + crash_balance_a).toFixed(2));
          document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_b").innerHTML = parseFloat((obj.account.peer.account_balance + target_profit_b + crash_balance_a - Math.abs(spread_cost_b)).toFixed(2) - Math.abs(commission_b).toFixed(2));
    }
  
    var actual_balance_a = (document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_a").innerHTML - 0) || 0 ;
    var actual_balance_b = (document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_b").innerHTML - 0) || 0;
  
    var total_initial_balance = obj.account.account_balance + obj.account.peer.account_balance;

    if(actual_balance_a > total_initial_balance){
      document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_a").style.color = 'teal';
    }
    
    if(actual_balance_a < total_initial_balance){
      document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_a").style.color = 'red';
    }

    if(actual_balance_b > total_initial_balance){
      document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_b").style.color = 'teal';
    }
    
    if(actual_balance_b < total_initial_balance){
      document.getElementById("compute_lot_size_dialog_label_actual_net_balance_for_account_b").style.color = 'red';
    }

}

function onSelectAuthType(el) {
  if (el.value == "Login") {
    document.getElementById("notification_username").disabled = false;
    document.getElementById("notification_password").disabled = false;
    document.getElementById("notification_client_id").disabled = "disabled";
    document.getElementById("notification_client_secret").disabled = "disabled";
    document.getElementById("notification_access_token").disabled = "disabled";
    document.getElementById("notification_refresh_token").disabled = "disabled";
    document.getElementById("notification_expiration_time").disabled =
      "disabled";
    document.getElementById("notification_access_url").disabled = "disabled";
  } else if (el.value == "OAuth2") {
    document.getElementById("notification_username").disabled = false;
    document.getElementById("notification_password").disabled = "disabled";
    document.getElementById("notification_client_id").disabled = false;
    document.getElementById("notification_client_secret").disabled = false;
    document.getElementById("notification_access_token").disabled = false;
    document.getElementById("notification_refresh_token").disabled = false;
    document.getElementById("notification_expiration_time").disabled = false;
    document.getElementById("notification_access_url").disabled = false;
  }
}

function getEmailNotificationSettinsgObj() {
  var obj = {};

  obj.send_notification_at_margin_call = document.getElementById(
    "send_notification_at_margin_call"
  ).checked;
  obj.send_notification_at_percentage_close_to_stopout =
    document.getElementById(
      "send_notification_at_percentage_close_to_stopout"
    ).checked;

  obj.send_notification_at_percentage_close_to_stopout_input =
    document.getElementById(
      "send_notification_at_percentage_close_to_stopout_input"
    ).value;
  obj.send_notification_session_information_every_interval_in_seconds =
    document.getElementById(
      "send_notification_session_information_every_interval_in_seconds"
    ).value;

  obj.send_notification_session_information_only_when_market_is_open =
    document.getElementById(
      "send_notification_session_information_only_when_market_is_open"
    ).checked;

  obj.notification_sender_email_address = document.getElementById(
    "notification_sender_email_address"
  ).value;
  obj.notification_recipient_email_address = document.getElementById(
    "notification_recipient_email_address"
  ).value;

  obj.notification_pool_connection = document.getElementById(
    "notification_pool_connection"
  ).checked;
  obj.notification_secure_connection = document.getElementById(
    "notification_secure_connection"
  ).checked;
  obj.notification_fail_on_invalid_certs = document.getElementById(
    "notification_fail_on_invalid_certs"
  ).checked;

  obj.notification_smtp_host = document.getElementById(
    "notification_smtp_host"
  ).value;
  obj.notification_smtp_port = document.getElementById(
    "notification_smtp_port"
  ).value;
  obj.notification_auth_type = document.getElementById(
    "notification_auth_type"
  ).value;
  obj.notification_username = document.getElementById(
    "notification_username"
  ).value;
  obj.notification_password = document.getElementById(
    "notification_password"
  ).value;
  obj.notification_client_id = document.getElementById(
    "notification_client_id"
  ).value;
  obj.notification_client_secret = document.getElementById(
    "notification_client_secret"
  ).value;
  obj.notification_access_token = document.getElementById(
    "notification_access_token"
  ).value;
  obj.notification_refresh_token = document.getElementById(
    "notification_refresh_token"
  ).value;
  obj.notification_expiration_time = document.getElementById(
    "notification_expiration_time"
  ).value;
  obj.notification_access_url = document.getElementById(
    "notification_access_url"
  ).value;

  return obj;
}

function setElValue(obj, prop, el) {
  if (el.type == "radio" || el.type == "checkbox") {
    if (obj[prop] == true || obj[prop] == false) {
      el.checked = obj[prop];
    }
  } else {
    if (obj[prop] !== null && obj[prop] !== undefined) {
      el.value = obj[prop];
    }
  }
}

function SaveNotificationSettings() {
  var app_config = {};

  mergeObjectTo(AppConfig, app_config);

  var obj = getEmailNotificationSettinsgObj();

  mergeObjectTo(obj, app_config);

  ipc.send("save-email-notification-config", app_config);
}

function VerifyNoticationConnection() {
  var obj = getEmailNotificationSettinsgObj();

  ipc.send("verify-email-notification-connection", obj);
}

function placeOrderDropdownSymbolsHTML() {
  var html = '<option value="">Select</option>';
  for (var n in AppConfig.symbol) {
    html += `<option value="${n}">${n}</option>`;
  }

  return html;
}

function getPeerAccount(broker, account_number) {
  for (var n in paired_accounts) {
    var pair = paired_accounts[n];
    if (pair[0].broker == broker && pair[0].account_number == account_number) {
      return pair[1];
    }
    if (pair[1].broker == broker && pair[1].account_number == account_number) {
      return pair[0];
    }
  }
}

function hideCenterContents() {
  $("#center_content_main").hide();
  $("#center_content_place_order_triggers").hide();
  $("#center_content_pairing").hide();
  $("#center_content_metrics").hide();
  $("#center_content_output").hide();
  $("#center_content_install_ea").hide();  
  $("#center_content_settings").hide();

  $("#btn_main").removeClass("active");
  $("#btn_place_order_triggers").removeClass("active");
  $("#btn_pairing").removeClass("active");
  $("#btn_metrics").removeClass("active");
  $("#btn_output").removeClass("active");
  $("#btn_install_ea").removeClass("active");
  $("#btn_settings").removeClass("active");
  
}

function showMain() {
  hideCenterContents();
  $("#btn_main").addClass("active");
  $("#center_content_main").fadeIn();
}

function displayPlaceOrderTriggers() {
  document.getElementById("trigger_count").innerHTML =
    place_order_triggers.length;
  var html = placeOrderTriggersHTML();
  if (html) {
    document.getElementById("center_content_place_order_triggers").innerHTML =
      html;
  }
}

function displayMetrics() {
  var html = orderMetricsHTML();
  if (html) {
    document.getElementById("center_content_metrics").innerHTML = html;
  }
}

function displayInstallEA() {

  var accounts = getAllAccounts();

  var tbody = '';

  for(var i=0; i< accounts.length; i++){
    var account = accounts[i];

    tbody +=`<tr>
                 <td>${account.broker}</td>
                 <td>${account.account_number}</td>
                 <td>${getEAUpToDateStatus(account)}</td>
              </tr>`    
  }
  
  document.getElementById('ea_install_tbody').innerHTML = tbody;
}

function getEAUpToDateStatus(account){
  if(account.ea_up_to_date === true){
    return '<i class="green checkmark icon"></i>'
  }else if(account.ea_up_to_date === false){
    return '<i class="red close icon"></i>'
  }else{//unknown
    return '...'
  }
}

function displaySymbolsConfiguration(edit, add, saved) {
  var html = symbolsConfigurationHTML(edit, add, saved);
  if (html) {
    document.getElementById("center_content_symbols_configuration").innerHTML =
      html;
  }
}

function AddConfigSymbol() {
  displaySymbolsConfiguration(false, true);
}

function EditConfigSymbol() {
  displaySymbolsConfiguration(true, false);
}

function SaveConfigSymbol() {
  var table = document.getElementById(
    "center_content_symbols_configuration_table"
  );
  if (!table) {
    return;
  }

  var rows = table.rows;

  var rel_broker_symbols = {};

  var symbols_spread = {};

  for (var i = 0; i < rows.length; i++) {
    if (rows[i].className == "center-content-symbols-configuration-row") {
      var cells = rows[i].children;
      var general_symbol = "";
      for (var k = 0; k < cells.length; k++) {
        var td = cells[k];
        var value = "";

        if (td.firstChild && td.firstChild.tagName.toLowerCase() == "input") {
          value = td.firstChild.value;
        } else {
          value = td.innerHTML.trim();
        }

        if (k == 0) {
          general_symbol = value;
          if (general_symbol) {
            rel_broker_symbols[general_symbol] = {};
          }

          continue;
        }

        if (general_symbol == "") {
          continue;
        }

        if (k == 1) {
          symbols_spread[general_symbol] = value;
          continue;
        }

        if(!rel_broker_symbols[general_symbol][td.dataset.broker]){
          rel_broker_symbols[general_symbol][td.dataset.broker] = {}
        }

        if(!rel_broker_symbols[general_symbol][td.dataset.broker][td.dataset.accountNumber]){
          rel_broker_symbols[general_symbol][td.dataset.broker][td.dataset.accountNumber] = {}
        }

        if(typeof td.dataset.relativeSymbol !== 'undefined'){
          rel_broker_symbols[general_symbol][td.dataset.broker][td.dataset.accountNumber]['symbol'] = value;
        }else if (typeof td.dataset.allowableEntrySpread !== 'undefined'){
          rel_broker_symbols[general_symbol][td.dataset.broker][td.dataset.accountNumber]['allowable_entry_spread'] = value;
        }
        
      }
    }
  }

  var app_config = {};

  mergeObjectTo(AppConfig, app_config);

  //modify
  app_config["symbol"] = rel_broker_symbols;
  app_config["spread"] = symbols_spread;

  ipc.send("save-symbols-config", app_config);
}

function SaveSettings() {
  var only_pair_live_accounts_with_same_account_name = document.getElementById(
    "only_pair_live_accounts_with_same_account_name"
  ).checked;
  var sync_check_interval_in_seconds = document.getElementById(
    "sync_check_interval_in_seconds"
  ).value;
  var maximum_log_records = document.getElementById(
    "maximum_log_records"
  ).value;
  var refresh_account_info_interval_in_seconds = document.getElementById(
    "refresh_account_info_interval_in_seconds"
  ).value;
  var automatically_avoid_loss_due_to_tomorrow_swap_by_closing_trades_before_swap_time =
    document.getElementById(
      "automatically_avoid_loss_due_to_tomorrow_swap_by_closing_trades_before_swap_time"
    ).value;

  var app_config = {};

  mergeObjectTo(AppConfig, app_config);

  //modify
  app_config["only_pair_live_accounts_with_same_account_name"] =
    only_pair_live_accounts_with_same_account_name;
  app_config["sync_check_interval_in_seconds"] = sync_check_interval_in_seconds;
  app_config["maximum_log_records"] = maximum_log_records;
  app_config["refresh_account_info_interval_in_seconds"] =
    refresh_account_info_interval_in_seconds;
  app_config[
    "automatically_avoid_loss_due_to_tomorrow_swap_by_closing_trades_before_swap_time"
  ] = automatically_avoid_loss_due_to_tomorrow_swap_by_closing_trades_before_swap_time;

  ipc.send("save-general-settings", app_config);
}

function settings(saved) {
  displayGeneralSettings(saved);
  displaySymbolsConfiguration(false, false, saved);
  displayNotificationConfiguration(saved);
}

function displayGeneralSettings(saved) {
  document.getElementById(
    "only_pair_live_accounts_with_same_account_name"
  ).checked = AppConfig["only_pair_live_accounts_with_same_account_name"];
  document.getElementById("sync_check_interval_in_seconds").value =
    AppConfig["sync_check_interval_in_seconds"];
  document.getElementById("maximum_log_records").value =
    AppConfig["maximum_log_records"];
  document.getElementById("refresh_account_info_interval_in_seconds").value =
    AppConfig["refresh_account_info_interval_in_seconds"];
  document.getElementById(
    "automatically_avoid_loss_due_to_tomorrow_swap_by_closing_trades_before_swap_time"
  ).value =
    AppConfig[
      "automatically_avoid_loss_due_to_tomorrow_swap_by_closing_trades_before_swap_time"
    ];

  //feed back
  if (saved === true) {
    document.getElementById("settings_feedback").className =
      "ui success message";
    document.getElementById("settings_message_title").innerHTML = "Success";
    document.getElementById("settings_message_body").innerHTML =
      "Saved settings successfully";
    document.getElementById("settings_feedback").style.display = "block";
    $("#settings_feedback").fadeIn();
  } else if (saved === false) {
    document.getElementById("settings_feedback").className = "ui error message";
    document.getElementById("settings_message_title").innerHTML = "Failed";
    document.getElementById("settings_message_body").innerHTML =
      "Failed to save the settings";
    document.getElementById("settings_feedback").style.display = "block";
    $("#settings_feedback").fadeIn();
  } else {
    $("#settings_feedback").hide();
    document.getElementById("settings_feedback").className = "";
    document.getElementById("settings_message_title").innerHTML = "";
    document.getElementById("settings_message_body").innerHTML = "";
  }
}

function displayNotificationConfiguration(saved) {
  setElValue(
    AppConfig,
    "send_notification_at_margin_call",
    document.getElementById("send_notification_at_margin_call")
  );
  setElValue(
    AppConfig,
    "send_notification_at_percentage_close_to_stopout",
    document.getElementById("send_notification_at_percentage_close_to_stopout")
  );
  setElValue(
    AppConfig,
    "send_notification_at_percentage_close_to_stopout_input",
    document.getElementById(
      "send_notification_at_percentage_close_to_stopout_input"
    )
  );
  setElValue(
    AppConfig,
    "send_notification_session_information_every_interval_in_seconds",
    document.getElementById(
      "send_notification_session_information_every_interval_in_seconds"
    )
  );
  setElValue(
    AppConfig,
    "send_notification_session_information_only_when_market_is_open",
    document.getElementById(
      "send_notification_session_information_only_when_market_is_open"
    )
  );

  setElValue(
    AppConfig,
    "notification_sender_email_address",
    document.getElementById("notification_sender_email_address")
  );
  setElValue(
    AppConfig,
    "notification_recipient_email_address",
    document.getElementById("notification_recipient_email_address")
  );

  setElValue(
    AppConfig,
    "notification_pool_connection",
    document.getElementById("notification_pool_connection")
  );
  setElValue(
    AppConfig,
    "notification_secure_connection",
    document.getElementById("notification_secure_connection")
  );
  setElValue(
    AppConfig,
    "notification_fail_on_invalid_certs",
    document.getElementById("notification_fail_on_invalid_certs")
  );

  setElValue(
    AppConfig,
    "notification_smtp_host",
    document.getElementById("notification_smtp_host")
  );
  setElValue(
    AppConfig,
    "notification_smtp_port",
    document.getElementById("notification_smtp_port")
  );
  setElValue(
    AppConfig,
    "notification_auth_type",
    document.getElementById("notification_auth_type")
  );
  setElValue(
    AppConfig,
    "notification_username",
    document.getElementById("notification_username")
  );
  setElValue(
    AppConfig,
    "notification_password",
    document.getElementById("notification_password")
  );
  setElValue(
    AppConfig,
    "notification_client_id",
    document.getElementById("notification_client_id")
  );
  setElValue(
    AppConfig,
    "notification_client_secret",
    document.getElementById("notification_client_secret")
  );
  setElValue(
    AppConfig,
    "notification_access_token",
    document.getElementById("notification_access_token")
  );
  setElValue(
    AppConfig,
    "notification_refresh_token",
    document.getElementById("notification_refresh_token")
  );
  setElValue(
    AppConfig,
    "notification_expiration_time",
    document.getElementById("notification_expiration_time")
  );
  setElValue(
    AppConfig,
    "notification_access_url",
    document.getElementById("notification_access_url")
  );

  if (saved == true) {
    document.getElementById("notification_feedback").className =
      "ui success message";
    document.getElementById("notification_message_title").innerHTML = "Success";
    document.getElementById("notification_message_body").innerHTML =
      "Saved configuration successfully";
    document.getElementById("notification_feedback").style.display = "block";
    $("#notification_feedback").fadeIn();
  } else if (saved == false) {
    document.getElementById("notification_feedback").className =
      "ui error message";
    document.getElementById("notification_message_title").innerHTML = "Failed";
    document.getElementById("notification_message_body").innerHTML =
      "Failed to save the configuration";
    document.getElementById("notification_feedback").style.display = "block";
    $("#notification_feedback").fadeIn();
  } else {
    $("#notification_feedback").hide();
    document.getElementById("notification_feedback").className = "";
    document.getElementById("notification_message_title").innerHTML = "";
    document.getElementById("notification_message_body").innerHTML = "";
  }
}

function displayNotificationConnectionVerificationFeedback(success, error) {
  if (success) {
    document.getElementById("notification_feedback").className =
      "ui success message";
    document.getElementById("notification_message_title").innerHTML = "Success";
    document.getElementById("notification_message_body").innerHTML =
      "Connection verified successfully";
    document.getElementById("notification_feedback").style.display = "block";
    $("#notification_feedback").fadeIn();
  } else {
    document.getElementById("notification_feedback").className =
      "ui error message";
    document.getElementById("notification_message_title").innerHTML = "Failed";
    document.getElementById("notification_message_body").innerHTML = error;
    document.getElementById("notification_feedback").style.display = "block";
    $("#notification_feedback").fadeIn();
  }
}

function storeOrder(account) {
  if (!account || !account.orders) {
    return;
  }

  for (n in account.orders) {
    var order = account.orders[n];

    //we only need the one with peer and just one of each pair so if an order of a pair
    //is stored, no need of storing its peer order
    if (
      order.ticket != -1 &&
      order.peer_ticket != -1 &&
      !paired_orders[order.peer_ticket]
    ) {
      paired_orders[order.ticket] = order;
    }

    //store all orders by their tickets
    orders[order.ticket] = order;
  }
}

function CancelTrigger(uuid) {
  confirmBox(
    "Confirm",
    "Are you sure you want to cancel the place order trigger?",
    function () {
      ipc.send("cancel-place-order-trigger", uuid);
    },
    function () {}
  );
}

function noDataHTML(info) {
  return `<div style= "width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; font-size: 72px; font-style: bold; color: #ccc; text-shadow: 0px 1px 2px #555;">
                    ${info ? info : "No Data"}
            </div>`;
}

function placeOrderTriggersHTML() {
  var tables = "";

  for (var n in place_order_triggers) {
    var trigger = place_order_triggers[n];

    var pair = findPair(
      trigger.buy_trader.broker,
      trigger.buy_trader.account_number
    );
    if (!pair) {
      continue;
    }
    var accountA = pair[0];
    var accountB = pair[1];

    tables += `
            <div class="ui teal segment">

                <div class="ui right floated small basic labeled icon button" onclick="CancelTrigger('${
                  trigger.uuid
                }')">
                      <i class="close icon"></i> Cancel Trigrer
                </div>
                <table class="ui compact celled definition structured table">
                    <thead class="full-width">
                            <tr>
                                <th colspan="1"></th>
                                <th>
                                        <h4 class="ui image header">
                                            <img src="${accountA.icon_file}">
                                            <div class="content">
                                                ${accountA.broker}
                                                <div class="sub header">
                                                    ${
                                                      accountA.account_number
                                                    } - ${accountTypeText(
      accountA
    )} on ${accountA.platform_type}
                                                </div>
                                            </div>
                                        </h4>
                                </th>

                                <th>
                                        <h4 class="ui image header">
                                            <img src="${accountB.icon_file}">
                                            <div class="content">
                                                ${accountB.broker}
                                                <div class="sub header">
                                                    ${
                                                      accountB.account_number
                                                    } - ${accountTypeText(
      accountB
    )} on ${accountB.platform_type}
                                                </div>
                                            </div>
                                        </h4>

                                </th>
                          </tr>

                          <tr>
                            <th>TRIGGER CONDITION</th>
                            <th colspan="2">${trigger.type}</th>
                          </tr>
                          <tr>
                            <th>TRIGGER PRICE</th>
                            <th colspan="2" ${
                              trigger.type ==
                              "Instant when both accounts have credit bonuses"
                                ? 'style="font-style: italic;"'
                                : ""
                            }>${
      trigger.type == "Instant when both accounts have credit bonuses"
        ? "At market price"
        : trigger.price
    }</th>
                          </tr>
                          <tr>
                            <th>SYMBOL</th>
                            <th colspan="2">${trigger.symbol}</th>
                          </tr>
                    </thead>
                    <tbody>
                          <tr>
                            <td>POSITION</td>
                            <td>${
                              accountA.broker == trigger.buy_trader.broker &&
                              accountA.account_number ==
                                trigger.buy_trader.account_number
                                ? "BUY"
                                : "SELL"
                            }</td>
                            <td>${
                              accountA.broker == trigger.buy_trader.broker &&
                              accountA.account_number ==
                                trigger.buy_trader.account_number
                                ? "SELL"
                                : "BUY"
                            }</td>
                          </tr>
                          <tr>
                            <td>LOT SIZE</td>
                            <td>${
                              accountA.broker == trigger.buy_trader.broker &&
                              accountA.account_number ==
                                trigger.buy_trader.account_number
                                ? trigger.buy_lot_size
                                : trigger.sell_lot_size
                            }</td>
                            <td>${
                              accountA.broker == trigger.buy_trader.broker &&
                              accountA.account_number ==
                                trigger.buy_trader.account_number
                                ? trigger.sell_lot_size
                                : trigger.buy_lot_size
                            }</td>
                          </tr>
                    </tbody>
                    <tfoot class="full-width">
                        <tr>
                            <th colspan="3" style="font-style: italic;">${
                              trigger.remark
                            }</th>
                        </tr>
                    </tfoot>
                 </table>
            </div>`;
  }

  if (!tables) {
    tables = noDataHTML("No Trigger");
  }

  return tables;
}

function orderMetricsHTML() {
  var tables = "";

  for (var n in orders) {
    var order = orders[n];

    var orderA = orders[order.ticket];
    var orderB = orders[order.peer_ticket];

    tables += `
            <div class="ui teal segment">
                
                <table class="ui compact celled definition structured table">
                    <thead class="full-width">
                      <tr>
                        <th colspan="1"></th>
                        <th  id="${orderMetricsTableColumnAID(orderA)}">

                                <h4 class="ui image header">
                                    <div class="content">
                                        ${
                                          order.ticket
                                        }                                       
                                    </div>
                                </h4>

                        </th>

                        <th id="${orderMetricsTableColumnBID(orderB)}">

                                <h4 class="ui image header">
                                    <div class="content">
                                        ${order.peer_ticket}
                                    </div>
                                </h4>

                        </th>

                        <th>

                                <h4 class="ui image header">
                                    <div class="content">
                                        REMARKS
                                    </div>
                                </h4>

                        </th>

                    </tr> 
                    </thead>
                    <tbody id="${orderMetricsTableContentID(orderA)}">
                    ${orderMetricsTableContent(order)}
                    </tbody>
                    
                 </table>
            </div>`;
  }

  if (!tables) {
    tables = noDataHTML("No Metric");
  }

  return tables;
}

function orderMetricsTableContent(order) {
  var orders_a = orders[order.ticket];
  var orders_b = orders[order.peer_ticket];

  var tbody = `<tr>
                    <td class="definition">OPEN TIME</td>
                    <td>${cellContent(order_a.open_time)}</td>
                    <td>${cellContent(order_b.open_time)}</td>
                    <td rowspan="3">${remarkForCopy(orders_a, orders_b)}</td>
                  </tr>
                  <tr>
                    <td>COPY SIGNAL TIME</td>
                    <td>${cellContent(order_a.copy_signal_time)}</td>
                    <td>${cellContent(order_b.copy_signal_time)}</td>
                  </tr>
                  <tr>
                    <td>COPY EXECUTION TIME</td>
                    <td>${cellContent(order_a.copy_execution_time)}</td>
                    <td>${cellContent(order_b.copy_execution_time)}</td>
                  </tr>
                  <tr>
                    <td>CLOSE TIME</td>
                    <td>${cellContent(order_a.close_time)}</td>
                    <td>${cellContent(order_b.close_time)}</td>
                    <td rowspan="3">${remarkForClose(orders_a, orders_b)}</td>
                  </tr>
                  <tr>
                    <td>CLOSE SIGNAL TIMME</td>
                    <td>${cellContent(order_a.close_signal_time)}</td>
                    <td>${cellContent(order_b.close_signal_time)}</td>
                  </tr>
                  <tr>
                    <td>CLOSE EXECUTION TIME</td>
                    <td>${cellContent(order_a.close_execution_time)}</td>
                    <td>${cellContent(order_b.close_execution_time)}</td>
                  </tr>
                  <tr>
                    <td>STOPLOSS CHANGE TIME</td>
                    <td>${cellContent(order_a.stoploss_change_time)}</td>
                    <td>${cellContent(order_b.stoploss_change_time)}</td>
                    <td rowspan="3">${remarkForStoplossChange(
                      orders_a,
                      orders_b
                    )}</td>
                  </tr>
                  <tr>
                    <td>MODIFY TARGET SIGNAL TIME</td>
                    <td>${cellContent(order_a.modify_target_signal_time)}</td>
                    <td>${cellContent(order_b.modify_target_signal_time)}</td>
                  </tr>
                  <tr>
                    <td>MODIFY TARGET EXECUTION TIME</td>
                    <td>${cellContent(
                      order_a.modify_target_execution_time
                    )}</td>
                    <td>${cellContent(
                      order_b.modify_target_execution_time
                    )}</td>
                  </tr>
                  <tr>
                    <td>TARGET CHANGED TIME</td>
                    <td>${cellContent(order_a.target_change_time)}</td>
                    <td>${cellContent(order_b.target_change_time)}</td>
                    <td rowspan="3">${remarkForTargetChange(
                      orders_a,
                      orders_b
                    )}</td>
                  </tr>
                  <tr>
                    <td>MODIFY STOPLOSS SIGNAL TIME</td>
                    <td>${cellContent(order_a.modify_stoploss_signal_time)}</td>
                    <td>${cellContent(order_b.modify_stoploss_signal_time)}</td>
                  </tr>
                  <tr>
                    <td>MODIFY STOPLOSS EXECUTION TIME</td>
                    <td>${cellContent(
                      order_a.modify_stoploss_execution_time
                    )}</td>
                    <td>${cellContent(
                      order_b.modify_stoploss_execution_time
                    )}</td>
                  </tr>`;

  return tbody;
}

function symbolsConfigurationHTML(edit, add, saved) {
  var accounts = getAllAccounts();
  var brokers = getAllBroker();
  var rows;
  var td = "";

  for (var k in accounts) {
    td += `<td  class="definition" colspan='2'>${accounts[k].broker}<br/>${accounts[k].account_number}</td>`;
  }

  var head_row = `<tr>
                         <td rowspan="2">Symbol</td>
                         <td  class="definition" rowspan="2">Spread</td>   
                         <td class="definition" colspan="${accounts.length * 2}">Brokers Relative Symbols / Allowable Entry Spread (to control spread cost)</td>
                    </tr>
                    <tr>
                        ${td}
                    </tr>`;

  td = ""; //initialize
  var body_rows = "";
  for (var i in AppConfig.symbol) {
    //i is the general symbol
    var spread = AppConfig.spread[i];
    var td = `<td  class="definition">${symbolCell(
      i,
      edit,
      true
    )}</td><td>${spreadCell(spread, edit, true)}</td>`;

    for (var k in accounts) {
      var relative_symbol = "";
      var relative_allowable_entry_spread = "";
      var account = accounts[k];
      
      var relativeBrokerProp = AppConfig.symbol[i][account.broker]?.[account.account_number];

      if (typeof relativeBrokerProp === 'string') {
        //support for old configuration
        relative_symbol = relativeBrokerProp; 
      }else if (typeof relativeBrokerProp === 'object'){
        //using new configuration
        relative_symbol = relativeBrokerProp['symbol']
        relative_allowable_entry_spread = relativeBrokerProp['allowable_entry_spread']
      }

      td += `<td data-broker='${account.broker}' data-account-number='${account.account_number}' data-relative-symbol >${symbolCell(
        relative_symbol,
        edit
      )}</td>`;
      
      td += `<td data-broker='${account.broker}' data-account-number='${account.account_number}' data-allowable-entry-spread >${allowableEntrySpreadCell(
        relative_allowable_entry_spread,
        edit,
        true
      )}</td>`;//new
    }

    body_rows += `<tr class='center-content-symbols-configuration-row'>${td}</tr>`;
  }

  if (add) {
    td = `<td class="definition">${symbolCell(
      "",
      true,
      true
    )}</td><td>${spreadCell("", true, true)}</td>`;
    for (var k in accounts) {
      var account = accounts[k];
      td += `<td data-broker='${account.broker}'  data-account-number='${account.account_number}' data-relative-symbol >${symbolCell("", true)}</td>`;
      td += `<td data-broker='${account.broker}'  data-account-number='${account.account_number}' data-allowable-entry-spread >${allowableEntrySpreadCell("", true, true)}</td>`;//new
    }
    body_rows += `<tr class='center-content-symbols-configuration-row'>${td}</tr>`;
  }

  var saveTr = "";

  if (saved === true || saved === false) {
    var strSave = "Could not save!";
    if (saved) {
      strSave = "Saved successfully!";
    }
    saveTr = `<div class="ui success message">
                    ${strSave}                   
                  </div>`;
  }

  var table = `<div style='width: 100%; overflow: auto; margin-bottom: 20px; padding-top: 20px;'>
                        <table  class="ui compact celled definition structured table sixteen wide column" id='center_content_symbols_configuration_table'>
                         <thead>
                           ${head_row} 
                         </thead>
                         <tbody>
                           ${body_rows} 
                         </tbody>
                         <tfoot>
                              <tr>
                                <th colspan="${accounts.length * 2 + 2}"></th>
                              </tr>
                         </tfoot>   
                    </table>
                </div>

                <div class="ui grid">

                    <div class="three wide column">
                        <div class="ui left floated small primary labeled icon button" onclick="AddConfigSymbol()">
                            <i class="add icon"></i> Add
                       </div>
                  
                    </div>

                    <div class="three wide column">

                        <div class="ui left floated small primary labeled icon button" onclick="EditConfigSymbol()">
                            <i class="edit icon"></i> Edit
                        </div>
                  

                    </div>

                    <div class="three wide column">

                             <div class="ui left floated small primary labeled icon button" onclick="SaveConfigSymbol()">
                                <i class="save icon"></i> Save
                              </div>
                  

                    </div>
                </div>

               ${saveTr}

                `;

  return table;
}

function symbolCell(symbol, edit, base) {
  var base_style = "";
  if (base) {
    base_style = "width: 80px;; float: left;";
  }
  var edit_include = edit
    ? ` style="${base_style}"`
    : `readonly ="readonly" style="${base_style} border:none; outline: none; color: inherit; background: inherit; font-weight: inherit; font-size: inherit; font-style: inherit;"`;
  return `<input type="text" ${edit_include} value ='${symbol}'/>`;
}

function allowableEntrySpreadCell(spread, edit, base) {
  return spreadCell(spread, edit, base);
}

function spreadCell(spread, edit, base) {
  var base_style = "";
  if (base) {
    base_style = "width: 60px; ; float: right;";
  }
  if (!spread) {
    spread = 0;
  }
  var edit_include = edit
    ? ` style="${base_style}"`
    : `readonly ="readonly" style="${base_style} border:none; outline: none; color: inherit; background: inherit; font-weight: inherit; font-size: inherit; font-style: inherit;"`;
  return `<input type="number" ${edit_include} value ='${spread}' min='0'/>`;
}

function cellContent(str, alt) {
  if (alt === undefined || alt === null) {
    alt = "-";
  }

  var content = str;

  return content;
}

function orderMetricsTableContentID(order) {
  return `table_${order.ticket}`;
}

function orderMetricsTableColumnAID(order) {
  return `table_col_a_${order.ticket}`;
}

function orderMetricsTableColumnBID(order) {
  return `table_col_b_${order.peer_ticket}`;
}

function findPair(broker, account_number) {
  for (var i in paired_accounts) {
    var accountA = paired_accounts[i][0];
    var accountB = paired_accounts[i][1];

    if (
      accountA.broker == broker &&
      accountA.account_number == account_number
    ) {
      return paired_accounts[i];
    }

    if (
      accountB.broker == broker &&
      accountB.account_number == account_number
    ) {
      return paired_accounts[i];
    }
  }
}

function getAccount(broker, account_number) {
  for (var i in unpaired_accounts) {
    if (
      unpaired_accounts[i].broker == broker &&
      unpaired_accounts[i].account_number == account_number
    ) {
      return unpaired_accounts[i];
    }
  }

  for (var i in paired_accounts) {
    var accountA = paired_accounts[i][0];
    var accountB = paired_accounts[i][1];

    if (
      accountA.broker == broker &&
      accountA.account_number == account_number
    ) {
      return accountA;
    }

    if (
      accountB.broker == broker &&
      accountB.account_number == account_number
    ) {
      return accountB;
    }
  }
}

function pairingComponent() {
  if (
    Object.keys(paired_accounts).length > 0 &&
    unpaired_accounts.length == 0
  ) {
    document.getElementById("pairing_number_info").innerHTML =
      "All accounts are paired!";
    document.getElementById("pairing_number_info").style.color = "#4DBD33";
  }

  if (unpaired_accounts.length > 0) {
    document.getElementById("pairing_number_info").innerHTML =
      unpaired_accounts.length > 1
        ? `${unpaired_accounts.length}  accounts remain unpaired!`
        : `${unpaired_accounts.length}  account remains unpaired!`;

    document.getElementById("pairing_number_info").style.color = "#222222";
  }

  populatePairingDropdownA();
  populatePairingDropdownB();
  populatePairedAccountTable();
}

function populatePairingDropdownA() {
  var el = document.getElementById("pairing_accounts_dropdown_a");
  var menu = el.querySelector(".menu");

  for (var i in unpaired_accounts) {
    var unpaired_broker = unpaired_accounts[i].broker;
    var unpaired_account_number = unpaired_accounts[i].account_number;
    var found = false;
    for (var k in menu.children) {
      var child = menu.children[k];
      if (!child.dataset) {
        continue;
      }

      var broker = child.dataset.broker;
      var account_number = child.dataset.accountNumber;

      if (
        broker == unpaired_broker &&
        account_number == unpaired_account_number
      ) {
        found = true;
        break;
      }

      //also check if the other dropdown has selected it so as to exclude it from the list in the dropdown
      if (
        selectedPairingAccountB &&
        selectedPairingAccountB.broker == broker &&
        selectedPairingAccountB.account_number == account_number
      ) {
        found = true;
        menu.removeChild(child);
        break;
      }
    }

    if (!found) {
      var account = getAccount(unpaired_broker, unpaired_account_number);
      menu.insertAdjacentHTML("beforeend", dropdownAccountItemHTML(account));
    }
  }

  $("#pairing_accounts_dropdown_a").dropdown({
    onChange: function (value, text, $selectedItem) {
      if (!$selectedItem) {
        return;
      }

      selectedPairingAccountA = getAccount(
        $selectedItem[0].dataset.broker,
        $selectedItem[0].dataset.accountNumber
      );

      populatePairingDropdownB(); //update the other dropdown to exclude the selected one
    },
  });
}

function populatePairingDropdownB() {
  var el = document.getElementById("pairing_accounts_dropdown_b");
  var menu = el.querySelector(".menu");

  for (var i in unpaired_accounts) {
    var unpaired_broker = unpaired_accounts[i].broker;
    var unpaired_account_number = unpaired_accounts[i].account_number;
    var found = false;
    for (var k in menu.children) {
      var child = menu.children[k];
      if (!child.dataset) {
        continue;
      }

      var broker = child.dataset.broker;
      var account_number = child.dataset.accountNumber;

      if (
        broker == unpaired_broker &&
        account_number == unpaired_account_number
      ) {
        found = true;
        break;
      }

      //also check if the other dropdown has selected it so as to exclude it from the list in the dropdown
      if (
        selectedPairingAccountA &&
        selectedPairingAccountA.broker == broker &&
        selectedPairingAccountA.account_number == account_number
      ) {
        found = true;
        menu.removeChild(child);
        break;
      }
    }

    if (!found) {
      var account = getAccount(unpaired_broker, unpaired_account_number);
      menu.insertAdjacentHTML("beforeend", dropdownAccountItemHTML(account));
    }
  }

  $("#pairing_accounts_dropdown_b").dropdown({
    onChange: function (value, text, $selectedItem) {
      if (!$selectedItem) {
        return;
      }

      selectedPairingAccountB = getAccount(
        $selectedItem[0].dataset.broker,
        $selectedItem[0].dataset.accountNumber
      );

      populatePairingDropdownA(); //update the other dropdown to exclude the selected one
    },
  });
}

function populatePairedAccountTable() {
  var table = document.getElementById("pairing_accounts_paired_table");
  var rows = table.rows;

  for (var i in paired_accounts) {
    var paired_brokerA = paired_accounts[i][0].broker;
    var paired_account_numberA = paired_accounts[i][0].account_number;

    var paired_brokerB = paired_accounts[i][1].broker;
    var paired_account_numberB = paired_accounts[i][1].account_number;

    var found = false;
    for (var k = 0; k < rows.length; k++) {
      var row = rows[k];

      if (row.cells.length != 4) {
        continue;
      }

      var cellAccountA = row.cells[1].firstElementChild; //second cell
      var cellAccountB = row.cells[2].firstElementChild; //third cell

      if (!cellAccountA.dataset || !cellAccountB.dataset) {
        continue;
      }

      var brokerA = cellAccountA.dataset.broker;
      var account_numberA = cellAccountA.dataset.accountNumber;

      var brokerB = cellAccountB.dataset.broker;
      var account_numberB = cellAccountB.dataset.accountNumber;

      if (
        (brokerA == paired_brokerA &&
          account_numberA == paired_account_numberA &&
          brokerB == paired_brokerB &&
          account_numberB == paired_account_numberB) ||
        (brokerA == paired_brokerB &&
          account_numberA == paired_account_numberB &&
          brokerB == paired_brokerA &&
          account_numberB == paired_account_numberA)
      ) {
        found = true;
        break;
      }
    }

    if (!found) {
      var accountA = getAccount(paired_brokerA, paired_account_numberA);
      var accountB = getAccount(paired_brokerB, paired_account_numberB);
      document
        .getElementById("pairing_accounts_paired_tbody")
        .insertAdjacentHTML(
          "beforeend",
          tablePairedAccountRowHTML(accountA, accountB)
        );
    }
  }

  //find and remove entries that are unpaired
  for (var i in unpaired_accounts) {
    var unpaired_broker = unpaired_accounts[i].broker;
    var unpaired_account_number = unpaired_accounts[i].account_number;

    var found = false;
    for (var k = 0; k < rows.length; k++) {
      var row = rows[k];

      if (row.cells.length != 4) {
        continue;
      }

      var cellAccountA = row.cells[1].firstElementChild; //second cell
      var cellAccountB = row.cells[2].firstElementChild; //third cell

      if (!cellAccountA.dataset || !cellAccountB.dataset) {
        continue;
      }

      var brokerA = cellAccountA.dataset.broker;
      var account_numberA = cellAccountA.dataset.accountNumber;

      var brokerB = cellAccountB.dataset.broker;
      var account_numberB = cellAccountB.dataset.accountNumber;

      if (
        (brokerA == unpaired_broker &&
          account_numberA == unpaired_account_number) ||
        (brokerB == unpaired_broker &&
          account_numberB == unpaired_account_number)
      ) {
        //remove the row since the account is unpaired
        row.parentNode.removeChild(row);

        break;
      }
    }
  }

  $(".ui.checkbox").checkbox();
}

function dropdownAccountItemHTML(account) {
  if (!account) {
    return "";
  }
  return `<div class="item" data-broker="${
    account.broker
  }" data-account-number="${account.account_number}" ">
                    <img class="ui avatar image" src="${account.icon_file}">
                    <div class="content">
                        <a class="header">${account.broker}</a>
                        <div class="description">${
                          account.account_number
                        } - ${accountTypeText(account)} on ${
    account.platform_type
  }</div>
                    </div>
                </div>`;
}

function tablePairedAccountRowHTML(accountA, accountB) {
  if (!accountA || !accountB) {
    return "";
  }
  return `<tr>

            <!--1st cell-->
            <td>
                <div class="ui checkbox">
                  <input type="checkbox" data-pair_id = "${accountA.pair_id}">
                </div>            
            </td>

            <!--2nd cell-->
            <td>
                <div class="item" data-broker="${
                  accountA.broker
                }" data-account-number="${accountA.account_number}" ">
                        <img class="ui avatar image" src="${
                          accountA.icon_file
                        }">
                        <div class="content">
                            <a class="header">${accountA.broker}</a>
                            <div class="description">${
                              accountA.account_number
                            } - ${accountTypeText(accountA)} on ${
    accountA.platform_type
  }</div>
                        </div>
                 </div>
            </td>

            <!--3rd cell-->
            <td>
                <div class="item" data-broker="${
                  accountB.broker
                }" data-account-number="${accountB.account_number}" ">
                        <img class="ui avatar image" src="${
                          accountB.icon_file
                        }">
                        <div class="content">
                            <a class="header">${accountB.broker}</a>
                            <div class="description">${
                              accountB.account_number
                            } - ${accountTypeText(accountB)} on ${
    accountB.platform_type
  }</div>
                        </div>
                </div>
            </td>

            <!--4th cell-->
            <td>
                <div class="ui small primary labeled icon button" onclick="showPairedByPairID('${
                  accountA.pair_id
                }')">
                                <i class="sync icon"></i> Goto
                </div>
            </td>

            </tr>`;
}

function getSelectedPairingsToRemove() {
  var table = document.getElementById("pairing_accounts_paired_table");
  var rows = table.rows;

  var pairs = [];

  for (var k = 0; k < rows.length; k++) {
    var row = rows[k];

    if (row.cells.length != 4) {
      continue;
    }

    var cellCheckBox = row.cells[0].firstElementChild.firstElementChild; //first cell

    if (!cellCheckBox.checked) {
      continue;
    }

    var cellAccountA = row.cells[1].firstElementChild; //second cell
    var cellAccountB = row.cells[2].firstElementChild; //third cell

    if (!cellAccountA.dataset || !cellAccountB.dataset) {
      continue;
    }

    var brokerA = cellAccountA.dataset.broker;
    var account_numberA = cellAccountA.dataset.accountNumber;

    var brokerB = cellAccountB.dataset.broker;
    var account_numberB = cellAccountB.dataset.accountNumber;

    var accountA = getAccount(brokerA, account_numberA);
    var accountB = getAccount(brokerB, account_numberB);

    var pair = [accountA, accountB];

    pairs.push(pair);
  }

  return pairs;
}

function addInfoLog(str_log) {
  addLog(str_log, "info");
}

function addSuccessLog(str_log) {
  addLog(str_log, "success");
}

function addErrorLog(str_log) {
  addLog(str_log, "error");
}

function addLog(str_log, type) {
  var logObj = {
    type: type,
    time: new Date(),
    data: str_log,
  };

  logs.push(logObj);
  if (logs.length > AppConfig.maximum_log_records) {
    logs.shift(); //remove the first element
  }

  document.getElementById("output_count").innerHTML = logs.length;

  if ($("#btn_output").hasClass("active")) {
    displayLog();
  }
}

function displayLog() {
  var html = "";
  var timezone = "";
  var cell_padding =
    ' style = "padding-top:3px !important;padding-bottom:3px !important;"';

  for (var i = logs.length - 1; i > -1; i--) {
    var objLog = logs[i];
    if (!timezone) {
      //alert((objLog.time + ""));
      timezone = (objLog.time + "").substring(25, 33);
    }
    var date_arr = new Date(
      objLog.time.getTime() - objLog.time.getTimezoneOffset() * 60000
    )
      .toISOString()
      .split("T");
    var date_time = date_arr[0] + " " + date_arr[1].substring(0, 8);

    var icon = "";
    switch (objLog.type) {
      case "info":
        icon = "info circle icon";
        break;
      case "success":
        icon = "check circle green icon";
        break;
      case "error":
        icon = "close icon red";
        break;
    }

    html += `<tr>
          <td class="collapsing" ${cell_padding}><i class="${icon}"></i></td>
          <td ${cell_padding}>${date_time}</td>
          <td ${cell_padding}>${objLog.data}</td>
        </tr>`;
  }

  html = `
        <table class="ui selectable celled single line table">
        <thead>
            <tr>
              <th colspan = "2" ${cell_padding}>Time  ${timezone}</th>
              <th ${cell_padding}>Message</th>
            </tr>
          </thead>
        <tbody>
        ${html}
        </tbody>
        </table>`;

  if (html) {
    document.getElementById("center_content_output").innerHTML = html;
  }
}

function cursorNext() {
  if (cursorIndex < Object.keys(paired_accounts).length - 1) {
    cursorIndex++;
  }
}

function cursorPrev() {
  if (cursorIndex > 0) {
    cursorIndex--;
  }
}

function currentPair() {
  var index = -1;
  for (var n in paired_accounts) {
    index++;
    if (index == cursorIndex) {
      return paired_accounts[n];
    }
  }
}

function showPairedByPairID(pair_id) {
  //we will use broker and account_number to find since the pair_id is not available at the begining when the accounts are unpaired
  var index = -1;
  for (key in paired_accounts) {
    index++;

    if (key == pair_id) {
      cursorIndex = index;
      refreshPairedTable();
      showMain();

      //alert(cursorIndex);//TESTING!!!

      break;
    }
  }
}

function showPaired(broker, account_number) {
  //we will use broker and account_number to find since the pair_id is not available at the begining when the accounts are unpaired
  var index = -1;
  for (key in paired_accounts) {
    index++;
    var accountA = paired_accounts[key][0];
    var accountB = paired_accounts[key][1];

    if (
      (accountA.broker == broker &&
        accountA.account_number == account_number) ||
      (accountB.broker == broker && accountB.account_number == account_number)
    ) {
      cursorIndex = index;
      refreshPairedTable();
      showMain();

      //alert(cursorIndex);//TESTING!!!

      break;
    }
  }
}

function showNextPaired() {
  cursorNext();
  refreshPairedTable();

  //alertBox("Alert",cursorIndex+"");//TESTING!!!
}

function showPreviousPaired() {
  cursorPrev();
  refreshPairedTable();

  //alertBox("Alert", cursorIndex + "");//TESTING!!!
}

function RefreshSync() {
  ipc.send("refresh-sync", true);
}

function refreshPairedTable() {
  pair = currentPair();
  var html = pairedAccountHTML(pair);
  
  if (html && prevPairedTableHTML != html) {
    document.getElementById("center_content_main").innerHTML = html;
    prevPairedTableHTML = html; //save the html to reduce update frequency
  }
}

function refreshActionList() {
  var html = accountListHTML();
  if (html) {
    document.getElementById("right_pane").innerHTML = html;

    $(".account-list-item-popup-menu").popup({
      //inline: true,
      //hoverable: true,
      //position: 'bottom left',
      delay: {
        show: 300,
        hide: 800,
      },
    });
  }
}

function getAllAccounts() {
  var accounts = [];
  for (var n in paired_accounts) {
    var accountA = paired_accounts[n][0];
    var accountB = paired_accounts[n][1];

    if (accounts.findIndex((acct) => accountA.broker == acct.broker 
                            && accountA.account_number == acct.account_number) == -1) {
      accounts.push(accountA);
    }

    if (accounts.findIndex((acct) => accountB.broker == acct.broker 
                          && accountB.account_number == acct.account_number) == -1) {
      accounts.push(accountB);
    }
  }

  for (var n in unpaired_accounts) {
    var account = unpaired_accounts[n];

    if (accounts.findIndex((acct) => account.broker == acct.broker 
                            && account.account_number == acct.account_number) == -1) {
      accounts.push(account);
    }
  }

  return accounts;
}

function getAllBroker() {
  var brokers = [];
  for (var n in paired_accounts) {
    var brokerA = paired_accounts[n][0].broker;
    var brokerB = paired_accounts[n][1].broker;

    if (brokers.findIndex((b) => brokerA == b) == -1) {
      brokers.push(brokerA);
    }

    if (brokers.findIndex((b) => brokerB == b) == -1) {
      brokers.push(brokerB);
    }
  }

  for (var n in unpaired_accounts) {
    var broker = unpaired_accounts[n].broker;

    if (brokers.findIndex((b) => broker == b) == -1) {
      brokers.push(broker);
    }
  }

  return brokers;
}

function setAccount(account) {
  if (!account.broker || !account.account_number) {
    console.warn(
      "broker or account number not unknown - did you mean account?"
    );
    return false;
  }

  storeOrder(account);

  //remove from unpaired
  removeUnpaired(account);
  removeUnpaired(account.peer); // safe since we check for null

  if (account.peer) {
    paired_accounts[account.pair_id] = [];
    paired_accounts[account.pair_id][account.column_index] = account;
    paired_accounts[account.pair_id][account.peer.column_index] = account.peer;
  } else {
    addUnpaired(account);
  }

  if (paired_accounts[account.pair_id]) {
  }

  return true;
}

function removeUnpaired(account) {
  if (!account) {
    return;
  }

  var objIndex = unpaired_accounts.findIndex(
    (obj) =>
      obj.broker === account.broker &&
      obj.account_number === account.account_number
  );
  if (objIndex > -1) {
    unpaired_accounts.splice(objIndex, 1);
  }
}

function addUnpaired(account) {
  if (!account.broker || !account.account_number) {
    console.warn("broker or account number not known - did you mean account?");
    return;
  }
  const objIndex = unpaired_accounts.findIndex(
    (obj) =>
      obj.broker === account.broker &&
      obj.account_number === account.account_number
  );
  if (objIndex == -1) {
    unpaired_accounts.push(account);
  } else {
    unpaired_accounts[objIndex] = account;
  }
}

function removeAccount(account) {
  //paid_id may be empty so we will find and delete - longer but safer approach
  for (n in paired_accounts) {
    var pair = paired_accounts[n];
    if (
      (pair[0].broker == account.broker &&
        pair[0].account_number == account.account_number) ||
      (pair[1].broker == account.broker &&
        pair[1].account_number == account.account_number)
    ) {
      delete paired_accounts[n];
      break;
    }
  }

  addUnpaired(account);
}

function pairedAccountHTML(pair) {
  if (!pair) {
    return;
  }

  var tables = "";
  var tbody = "";

  var accountA = pair[0];
  var accountB = pair[1];

  var table = `
            <div class="ui teal segment">

                <div class="ui left floated small primary labeled icon button" onclick="PlaceOrder()">
                      <i class="paper plane icon"></i> Place Order
                </div>


                <div class="ui right floated pagination menu">
                        
                        <a class="icon item ${
                          cursorIndex == 0 ? "disabled" : ""
                        }" onclick="showPreviousPaired()">
                          <i class="left chevron icon"></i>
                        </a>
                        <div class="item">
                        <span>${
                          cursorIndex + 1
                        }</span><span style="padding-left:10px;padding-right:10px;">of</span><span>${
    Object.keys(paired_accounts).length
  }</span>
                        </div>
                        <a class="icon item ${
                          cursorIndex == Object.keys(paired_accounts).length - 1
                            ? "disabled"
                            : ""
                        }"  onclick="showNextPaired()">
                          <i class="right chevron icon"></i>
                        </a>
                </div>
                <table class="ui compact celled definition structured table">
                    <thead class="full-width">
                      <tr>
                        <th colspan="2" rowspan="2"></th>
                        <th  id="${tableColumnAID(accountA)}">

                                <h4 class="ui image header">
                                    <img src="${accountA.icon_file}">
                                    <div class="content">
                                        ${accountA.broker}
                                        <div class="sub header">
                                            ${
                                              accountA.account_number
                                            } - ${accountTypeText(
    accountA
  )} on ${accountA.platform_type}
                                        </div>
                                    </div>
                                </h4>

                        </th>

                        <th id="${tableColumnBID(accountB)}">

                                <h4 class="ui image header">
                                    <img src="${accountB.icon_file}">
                                    <div class="content">
                                        ${accountB.broker}
                                        <div class="sub header">
                                            ${
                                              accountB.account_number
                                            } - ${accountTypeText(
    accountB
  )} on ${accountB.platform_type}
                                        </div>
                                    </div>
                                </h4>

                        </th>
                    </tr>
                    <tr>
                        <th>
                            ${marketOpenOrClosedText(accountA)}
                        </th>
                        <th>
                            ${marketOpenOrClosedText(accountB)}
                        </th>
                    </tr>  

                  <tr>
                    <th colspan="2">
                    <div>HEDGE PROFIT</div>
                    <div style="font-size: 12px;"><i>less commission & swap</i></div>
                    </th>
                    <th class="green">
                      <div style="font-size: 12px;">${accountA.hedge_profit.toFixed(2)} ${accountA.account_currency} </div>
                      <div style="color:teal;">${(accountA.hedge_profit + accountA.account_swap_cost + accountA.account_commission_cost).toFixed(2)} ${accountA.account_currency} </div>
                    </th>
                    <th class="green">
                      <div style="font-size: 12px;">${accountB.hedge_profit.toFixed(2)} ${accountB.account_currency}</div>
                      <div style="color:teal;">${(accountB.hedge_profit + accountB.account_swap_cost + accountB.account_commission_cost).toFixed(2)} ${accountA.account_currency}</div>
                    </th>
                  </tr>
                  
                    </thead>
                    <tbody id="${tableContentID(accountA)}">
                    ${tableContent(pair)}
                    </tbody>
                    <tfoot class="full-width">
                      <tr>
                        <th></th>
                        <th colspan="4">
                          <div class="ui right floated small primary labeled icon button" onclick="RefreshSync()">
                            <i class="sync icon"></i> Refresh Sync
                          </div>
                  
                        </th>
                      </tr>
                    </tfoot>
                 </table>
            </div>`;

  return table;
}

function tableContent(pair) {
  var ordersA = pair[0].orders;
  var ordersB = pair[1].orders;
  var tbody = "";
  var count = 0;
  for (var i in ordersA) {
    var order_a = ordersA[i];

    if (order_a.ticket == -1) {
      continue;
    }

    if (order_a.peer_ticket == -1) {
      continue;
    }

    var found = false;
    var order_b;
    for (var k in ordersB) {
      order_b = ordersB[k];
      if (order_a.peer_ticket == order_b.ticket) {
        found = true;
        break;
      }
    }

    if (!found) {
      continue;
    }

    count++;
    tbody += `<tr>
                    <td rowspan = "8"  align="center" valign="middle" >${count}</td>
                    <td class="definition">SYMBOL</td>
                    <td>${order_a.symbol ? order_a.symbol : "-"}</td>
                    <td>${order_b.symbol ? order_b.symbol : "-"}</td>
                  </tr>
                  <tr>
                    <td>POSITION</td>
                    <td>${order_a.position ? order_a.position : "-"}</td>
                    <td>${order_b.position ? order_b.position : "-"} </td>
                  </tr>
                  <tr>
                    <td>TICKET</td>
                    <td>${order_a.ticket ? order_a.ticket : "-"}</td>
                    <td>${order_b.ticket ? order_b.ticket : "-"} </td>
                  </tr>
                  <tr>
                    <td>SPREAD</td>
                    <td>${
                      order_a.spread || order_a.spread == 0
                        ? order_a.spread
                        : "-"
                    }</td>
                    <td>${
                      order_b.spread || order_a.spread == 0
                        ? order_b.spread
                        : "-"
                    } </td>
                  </tr>
                  <tr>
                    <td>TARGET</td>
                    <td>${
                      order_a.target || order_a.target == 0
                        ? order_a.target
                        : "-"
                    }</td>
                    <td>${
                      order_b.target || order_a.target == 0
                        ? order_b.target
                        : "-"
                    } </td>
                  </tr>
                  <tr>
                    <td>STOPLOSS</td>
                    <td>${
                      order_a.stoploss || order_a.stoploss == 0
                        ? order_a.stoploss
                        : "-"
                    }</td>
                    <td>${
                      order_b.stoploss || order_a.stoploss == 0
                        ? order_b.stoploss
                        : "-"
                    } </td>
                  </tr>
                  <tr>
                    <td>STATUS</td>
                    <td>${getStatus(order_a)}</td>
                    <td>${getStatus(order_b)}</td>
                  </tr>
                  <tr>
                    <td>PROCESS</td>
                    <td>${getProcessIndication(order_a, order_b, 0)}</td>
                    <td>${getProcessIndication(order_a, order_b, 1)}</td>
                  </tr>`;
  }

  return tbody;
}

function marketOpenOrClosedText(account) {
  if (
    !account ||
    (account.is_market_closed !== true && account.is_market_closed !== false)
  ) {
    return "Market state is UNKNOWN";
  } else if (account.is_market_closed === true) {
    return "Market is CLOSED";
  } else if (account.is_market_closed === false) {
    return "Market is OPEN";
  }
}

function accountTypeText(account) {
  if (account.is_live_account === true) {
    return "Live";
  } else if (account.is_live_account === false) {
    return "Demo";
  } else {
    return "Unknown";
  }
}

function getStatus(order) {
  if (order.open_time > 0 && order.close_time == 0) return "OPEN";
  if (order.open_time > 0 && order.close_time > 0) return "CLOSED";
  return "UNKNOWN";
}

function SyncMessage(sub_msg) {
  return `<div class="ui icon mini message">
                  <i class="sync loading icon"></i>
                  <div class="content">
                    <div class="header">
                      Syncing...
                    </div>
                    <p>${sub_msg}.</p>
                  </div>
                </div>`;
}

function getProcessIndication(order_a, order_b, column_index) {
  //--Sending copy trade indicator
  var SendingCopyHtml = SyncMessage("Sending copy...");
  var ReceivingCopyHtml = SyncMessage("Receiving copy...");

  if (order_a.is_sync_copying && column_index == 0) {
    //console.log(SendingCopyHtml);

    return SendingCopyHtml;
  }

  if (order_a.is_sync_copying && column_index == 1) {
    //console.log(ReceivingCopyHtml);

    return ReceivingCopyHtml;
  }

  if (order_b.is_sync_copying && column_index == 1) {
    //console.log(SendingCopyHtml);

    return SendingCopyHtml;
  }

  if (order_b.is_sync_copying && column_index == 0) {
    //console.log(ReceivingCopyHtml);

    return ReceivingCopyHtml;
  }

  //--Sending close trade indicator

  var SendingCloseHtml = SyncMessage("Sending close...");
  var ReceivingCloseHtml = SyncMessage("Receiving close...");

  if (order_a.is_sync_closing && column_index == 0) {
    //console.log(SendingCloseHtml);

    return SendingCloseHtml;
  }

  if (order_a.is_sync_closing && column_index == 1) {
    //console.log(ReceivingCloseHtml);

    return ReceivingCloseHtml;
  }

  if (order_b.is_sync_closing && column_index == 1) {
    //console.log(SendingCloseHtml);

    return SendingCloseHtml;
  }

  if (order_b.is_sync_closing && column_index == 0) {
    //console.log(ReceivingCloseHtml);

    return ReceivingCloseHtml;
  }

  //--Sending modify target indicator
  var SendingModifyTargetHtml = SyncMessage("Sending modify target...");
  var ReceivingModifyTargetHtml = SyncMessage("Receiving modify target...");

  if (order_a.is_sync_modifying_target && column_index == 0) {
    //console.log(SendingModifyTargetHtml);

    return SendingModifyTargetHtml;
  }

  if (order_a.is_sync_modifying_target && column_index == 1) {
    //console.log(ReceivingModifyTargetHtml);

    return ReceivingModifyTargetHtml;
  }

  if (order_b.is_sync_modifying_target && column_index == 1) {
    //console.log(SendingModifyTargetHtml);

    return SendingModifyTargetHtml;
  }

  if (order_b.is_sync_modifying_target && column_index == 0) {
    //console.log(ReceivingModifyTargetHtml);

    return ReceivingModifyTargetHtml;
  }

  //--Sending modify stoploss indicator
  var SendingModifyStoplossHtml = SyncMessage("Sending modify stoploss...");
  var ReceivingModifyStoplossHtml = SyncMessage("Receiving modify stoploss...");

  if (order_a.is_sync_modifying_stoploss && column_index == 0) {
    //console.log(SendingModifyStoplossHtml);

    return SendingModifyStoplossHtml;
  }

  if (order_a.is_sync_modifying_stoploss && column_index == 1) {
    //console.log(ReceivingModifyStoplossHtml);

    return ReceivingModifyStoplossHtml;
  }

  if (order_b.is_sync_modifying_stoploss && column_index == 1) {
    //console.log(SendingModifyStoplossHtml);

    return SendingModifyStoplossHtml;
  }

  if (order_b.is_sync_modifying_stoploss && column_index == 0) {
    //console.log(ReceivingModifyStoplossHtml);

    return ReceivingModifyStoplossHtml;
  }

  if (!order_a.symbol && column_index == 0) {
    return "-";
  }

  if (!order_b.symbol && column_index == 1) {
    return "-";
  }

  return '<i class="large green checkmark icon"></i>'; //Tick mark
}

function accountListHTML() {
  var html = "";
  for (var n in paired_accounts) {
    var pair = paired_accounts[n];
    html += accountItemHTML(pair[0]);
    html += accountItemHTML(pair[1]);
  }

  for (var i in unpaired_accounts) {
    html += accountItemHTML(unpaired_accounts[i]);
  }

  return `<div class="ui celled selection list">${html}</div>`;
}

function labelAccountStatus(account, status) {
  var parentNode = document.getElementById("right_pane");
  var elementList = parentNode.querySelectorAll(".account-list-item");
  for (i = 0; i < elementList.length; i++) {
    var element = elementList[i];

    if (
      element.dataset.broker == account.broker &&
      element.dataset.accountNumber == account.account_number
    ) {
      element.querySelector(".account-list-item-label-paired").innerHTML =
        status;
    }

    if (account.peer && (status == PAIRED || status == NOT_PAIRED)) {
      if (
        element.dataset.broker == account.peer.broker &&
        element.dataset.accountNumber == account.peer.account_number
      ) {
        element.querySelector(".account-list-item-label-paired").innerHTML =
          status;
      }
    }
  }
}

function IsPaired(broker, account_number) {
  for (var n in paired_accounts) {
    var pair = paired_accounts[n];

    if (pair[0].broker == broker && pair[0].account_number == account_number) {
      return true;
    }
    if (pair[1].broker == broker && pair[1].account_number == account_number) {
      return true;
    }
  }

  return false;
}

function accountItemHTML(account) {
  return `<div class="item account-list-item" data-broker="${
    account.broker
  }" data-account-number="${account.account_number}"  onclick="showPaired('${
    account.broker
  }','${account.account_number}')">
                    <div class="right floated content" style="width: auto !important;">
                      <div class="ui dropdown  right floated"  style="margin-bottom: 2px; margin-right: 5px; min-width: 60px; text-align: right;">
                          <i class="account-list-item-popup-menu">${accountTypeText(
                            account
                          )} - ${account.platform_type}</i>
                      </div>

                      <div class"bottom right floated" style="text-align: right;"><i class="account-list-item-label-paired">${NOT_PAIRED}</i></div>
                    </div>
                    <img class="ui avatar image" src="${account.icon_file}">
                    <div class="content">
                        <a class="header">${account.broker}</a>
                        <div class="description">${account.account_number}</div>
                    </div>
                </div>`;
}

function tableContentID(account) {
  return `table_${getPairID(account)}`;
}

function tableColumnAID(account) {
  return `table_col_a_${getPairID(account)}`;
}

function tableColumnBID(account) {
  return `table_col_b_${getPairID(account)}`;
}

function getPairID(account) {
  var id = account.broker + "_" + account.account_number;
  var id = id.replace(new RegExp(" ", "g"), "_");
  return id;
}
