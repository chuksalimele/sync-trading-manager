
const electron = nodeRequire('electron') 
const ipc = electron.ipcRenderer; 

var NOT_PAIRED = 'Not paired';
var PAIRED = 'Paired';
var DISCONNECTED = 'Disconnected';

var cursorIndex = 0;

var paired_accounts = [];//map

var unpaired_accounts = [];

var orders = [];

var paired_orders = [];

var logs = [];

var MaxLogRecords = 200;

var DEFAULT_SYNC_CHECK_INTERVAL = 10;

var selectedPairingAccountA = null;

var selectedPairingAccountB = null;

var AppConfig = {
    spread: {},
    symbol: {}
    //todo - other fields may go below in the future
};


$(document).ready(function () {
        

    $("#btn-main").on('click', function () {
        showMain();
    })

    $("#btn-pairing").on('click', function () {
        hideCenterContents();
        $('#btn-pairing').addClass('active');
        $('#center-content-pairing').fadeIn();
        pairingComponent();
    })


    $("#btn-output").on('click', function () {
        hideCenterContents();
        $('#btn-output').addClass('active');
        $('#center-content-output').fadeIn();
        displayLog();
    })

    $("#btn-metrics").on('click', function () {
        hideCenterContents();
        $('#btn-metrics').addClass('active');
        $('#center-content-metrics').fadeIn();
        displayMetrics();
    })

    $("#btn-symbols-configuration").on('click', function () {

        if (!AppConfig.symbol || Object.keys(AppConfig.symbol).length == 0) {
            ipc.send('get-symbols-config', true);
        } else if (!AppConfig.spread || Object.keys(AppConfig.spread).length == 0) {//also
            ipc.send('get-symbols-config', true);
        }

        hideCenterContents();
        $('#btn-symbols-configuration').addClass('active');
        $('#center-content-symbols-configuration').fadeIn();
        displaySymbolsConfiguration();
    })

    
    $("#btn-settings").on('click', function () {
        hideCenterContents();
        $('#btn-settings').addClass('active');
        $('#center-content-settings').fadeIn();
        settings();
    })

    $("#pairing-account-btn").on('click', function () {
        if (!selectedPairingAccountA || !selectedPairingAccountB) {
            return;
        }  

        if (selectedPairingAccountA.broker == selectedPairingAccountB.broker
            && selectedPairingAccountA.account_number == selectedPairingAccountB.account_number) {
            alert('Cannot pair an account to itseft! Please select another account.');
            return 
        }

        ipc.send('pair-accounts', [selectedPairingAccountA, selectedPairingAccountB]);


        //clear selection

        selectedPairingAccountA = null;
        selectedPairingAccountB = null;

        setTimeout(function () {
            $('#pairing-accounts-dropdown-b')
                .dropdown('clear');

        }, 0);

        setTimeout(function () {

            $('#pairing-accounts-dropdown-a')
                .dropdown('clear');

        }, 0);


        
    })


    $("#pairing-account-remove-pairing-btn").on('click', function () {
        var pairs = getSelectedPairingsToRemove(); //array of pairs
        if (pairs.length > 0 && confirm(`You have selected ${pairs.length * 2} accounts to unpair.\nAre you sure you want to unpair them?`)) {
            if (pairs && pairs.length > 0) {
                ipc.send('remove-pairing', pairs);
            }
        }
    })
    
    ipc.send('start-sync', true);

    ipc.send('get-symbols-config', true);

    ipc.send('get-settings', true);



    ipc.on('sync-running', function (event, arg) {

        console.log('sync-running', arg);

        addSuccessLog("Sync serivce running...");
        
    });

    ipc.on('sync-restart', function (event, arg) {

        console.log('sync-restart', arg);

        addSuccessLog("Sync serivce restart...");
        
    });

    ipc.on('sync-close', function (event, arg) {

        console.log('sync-close', arg);

        addInfoLog("Sync serivce closed!");

    });

    ipc.on('intro', function (event, arg) {

        console.log('intro', arg);
        
        if (setAccount(arg)) {
            refreshActionList(arg);
            pairingComponent();
            displaySymbolsConfiguration();
        }
    });

    ipc.on('paired', function (event, arg) {

        console.log('paired', arg);

        if (setAccount(arg)) {
            refreshPairedTable();
        }

        labelAccountStatus(arg, PAIRED);

        pairingComponent();
    });

    ipc.on('paired-fail', function (event, arg) {

        console.log('paired-fail', arg);

        alert(arg);

    });

    ipc.on('already-paired', function (event, arg) {

        console.log('already-paired', arg);

        alert(arg);

    });


    ipc.on('could-not-remove-pairing', function (event, arg) {

        console.log('could-not-remove-pairing', arg);

        alert(arg.feedback);
    });


    ipc.on('was-not-paired', function (event, arg) {

        console.log('was-not-paired', arg);

        alert(arg);
    });
    
    ipc.on('unpaired', function (event, arg) {

        console.log('unpaired', arg);

        addInfoLog(`[${arg[0].broker}, ${arg[0].account_number}] pairing removed!`);

        addInfoLog(`[${arg[1].broker}, ${arg[1].account_number}] pairing removed!`);

        removeAccount(arg[0]);
        removeAccount(arg[1]);

        refreshPairedTable();

        labelAccountStatus(arg[0], NOT_PAIRED);
        labelAccountStatus(arg[1], NOT_PAIRED);

        pairingComponent();
    });
    
    ipc.on('account-disconnect', function (event, arg) {

        console.log('account-disconnect', arg);

        addInfoLog(`[${arg.broker}, ${arg.account_number}]  is disconnected!`);

        labelAccountStatus(arg, DISCONNECTED);
    });
    
    ipc.on('order', function (event, arg) {

        console.log('order', arg);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    
    ipc.on('place-order-paired', function (event, arg) {

        console.log('place-order-paired', arg);

        addInfoLog(`Paired place orders of [${arg.broker}, ${arg.account_number}] and [${arg.peer.broker}, ${arg.peer.account_number}]`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sending-place-order', function (event, arg) {

        console.log('sending-place-order', arg);

        addInfoLog(`Sending place order to [${arg.account.broker}, ${arg.account.account_number}]`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sync-place-order-success', function (event, arg) {

        console.log('sync-place-order-success', arg);

        addSuccessLog(`[${arg.broker}, ${arg.account_number}] place order successful.`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sync-place-order-fail', function (event, arg) {

        console.log('sync-place-order-fail', arg);

        addErrorLog(`[${arg.broker}, ${arg.account_number}] place order failed! ${arg.last_error}`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sending-sync-copy', function (event, arg) {

        console.log('sending-sync-copy', arg);

        addInfoLog(`[${arg.account.broker}, ${arg.account.account_number}]  sending sync copy to [${arg.account.peer.broker}, ${arg.account.peer.account_number}]`);

        if (setAccount(arg.account)) {
            refreshPairedTable();
        }
    });

    ipc.on('sync-copy-success', function (event, arg) {

        console.log('sync-copy-success', arg);

        addSuccessLog(`[${arg.broker}, ${arg.account_number}] sync copy successful.`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sync-copy-fail', function (event, arg) {

        console.log('sync-copy-fail', arg);

        addErrorLog(`[${arg.broker}, ${arg.account_number}] sync copy failed! ${arg.last_error}`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sending-sync-close', function (event, arg) {

        console.log('sending-sync-close', arg);

        addInfoLog(`[${arg.account.broker}, ${arg.account.account_number}]  sending sync close to [${arg.account.peer.broker}, ${arg.account.peer.account_number}]`);

        if (setAccount(arg.account)) {
            refreshPairedTable();
        }
    });


    ipc.on('sync-close-success', function (event, arg) {

        console.log('sync-close-success', arg);

        addSuccessLog(`[${arg.broker}, ${arg.account_number}] sync close successful.`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sync-close-fail', function (event, arg) {

        console.log('sync-close-fail', arg);

        addErrorLog(`[${arg.broker}, ${arg.account_number}] sync close failed! ${arg.last_error}`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sending-modify-target', function (event, arg) {

        console.log('sending-modify-target', arg);

        addInfoLog(`[${arg.account.broker}, ${arg.account.account_number}]  sending sync modify target to [${arg.account.peer.broker}, ${arg.account.peer.account_number}]`);

        if (setAccount(arg.account)) {
            refreshPairedTable();
        }
    });

    ipc.on('modify-target-success', function (event, arg) {

        console.log('modify-target-success', arg);

        addSuccessLog(`[${arg.broker}, ${arg.account_number}] sync modify target successful.`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('modify-target-fail', function (event, arg) {

        console.log('modify-target-fail', arg);

        addErrorLog(`[${arg.broker}, ${arg.account_number}] sync modify target failed! ${arg.last_error}`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('sending-modify-stoploss', function (event, arg) {

        console.log('sending-modify-stoploss', arg);

        addInfoLog(`[${arg.account.broker}, ${arg.account.account_number}]  sending sync modify stoploss to [${arg.account.peer.broker}, ${arg.account.peer.account_number}]`);

        if (setAccount(arg.account)) {
            refreshPairedTable();
        }
    });

    ipc.on('modify-stoploss-success', function (event, arg) {

        console.log('modify-stoploss-success', arg);

        addSuccessLog(`[${arg.broker}, ${arg.account_number}] sync modify stoploss successful.`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });

    ipc.on('modify-stoploss-fail', function (event, arg) {

        console.log('modify-stoploss-fail', arg);

        addErrorLog(`[${arg.broker}, ${arg.account_number}] sync modify stoploss failed! ${arg.last_error}`);

        if (setAccount(arg)) {
            refreshPairedTable();
        }
    });


    ipc.on('symbols-config', function (event, arg) {
        if (arg) {
            mergeObjectTo(arg, AppConfig);
            displaySymbolsConfiguration();
        }
    });

    ipc.on('symbols-config-save-success', function (event, arg) {

        console.log('symbols-config-save-success', arg);

        mergeObjectTo(arg, AppConfig);

        displaySymbolsConfiguration(false,false, true);

    });


    ipc.on('symbols-config-save-fail', function (event, arg) {

        console.log('symbols-config-save-fail', arg);

        displaySymbolsConfiguration(false, false, false);
    });


    ipc.on('settings', function (event, arg) {
        if (arg) {
            mergeObjectTo(arg, AppConfig);
            settings();
        }
    });

    ipc.on('settings-save-success', function (event, arg) {

        console.log('settins-save-success', arg);

        mergeObjectTo(arg, AppConfig);
        settings(true);

    });


    ipc.on('settings-save-fail', function (event, arg) {

        console.log('settings-save-fail', arg);

        settings(false);
    });


})

function mergeObjectTo(obj1, obj2) {
    for (var n in obj1) {
        obj2[n] = obj1[n]; 
    }
}

function PlaceOrder() {
    var pair = currentPair();
    if (!pair) {
        return;
    }
    var accountA = pair[0];
    var accountB = pair[1];

    var selected_account_for_buy;

    $("#place-order-dialog-subheading").html(`Sending instant order to account ${accountA.account_number} of ${accountA.broker} and ${accountB.account_number} of ${accountB.broker}`);

    
    $('#place-order-dialog')
        .modal({
            closable: false,
            onDeny: function () {
                
            },
            onApprove: function () {

                var obj = {};

                var account_for_buy_value = $('#place-order-dialog-accounts').dropdown('get value');
                

                if (!account_for_buy_value) {
                    alert('Please select account for buy side!');
                    return false;
                }


                var symbol = document.getElementById('place-order-dialog-symbols').value;
                
                var lot_size = document.getElementById('place-order-dialog-lot-size').value;


                if (!symbol) {
                    alert('Please select symbol!');
                    return false;
                }


                if (!lot_size) {
                    lot_size = 0;
                }

                var split = account_for_buy_value.split(',');
                var broker = split[0].trim();
                var account_number = split[1].trim();

                var account = getAccount(broker, account_number);

                obj.account = account;
                obj.symbol = symbol;
                obj.lot_size = lot_size;

                if (!AppConfig.symbol[symbol]) {
                    alert('Relative symbol not found!');
                    return false;
                }


                if (!AppConfig.symbol[symbol][broker]) {
                    alert(`Please configure the relative of ${symbol} for ${broker}!`);
                    return false;
                }

                var peer_broker = getPeerBroker(broker);

                if (!peer_broker) {
                    alert(`Could not find peer broker for ${broker}`);
                    return false;
                }


                if (!AppConfig.symbol[symbol][peer_broker]) {
                    alert(`Please configure the relative of ${symbol} for ${peer_broker}!`);
                    return false;
                }


                if (!AppConfig.spread[symbol] || AppConfig.spread[symbol] <= 0) {
                    alert(`Spread for ${symbol} must be greater than zero!\nHint: refer to Symbols Configuration to set value greater than zero.`);
                    return false;
                }


                ipc.send('place-order', obj);

            },
            onShow: function () {

                $('#place-order-dialog-accounts')
                    .dropdown();

                document.getElementById('place-order-dialog-acount-a-content').dataset.value = `${accountA.broker}, ${accountA.account_number}`;
                document.getElementById('place-order-dialog-acount-a-content').dataset.broker = `${accountA.broker}`;
                document.getElementById('place-order-dialog-acount-a-content').dataset.accountNumber = `${accountA.account_number}`;
                $("#place-order-dialog-acount-a-image").attr('src', `${accountA.icon_file}`);
                $("#place-order-dialog-acount-a-label").html(`${accountA.broker}, ${accountA.account_number}`);


                document.getElementById('place-order-dialog-acount-b-content').dataset.value = `${accountB.broker}, ${accountB.account_number}`;
                document.getElementById('place-order-dialog-acount-b-content').dataset.broker = `${accountB.broker}`;
                document.getElementById('place-order-dialog-acount-b-content').dataset.accountNumber = `${accountB.account_number}`;
                $("#place-order-dialog-acount-b-image").attr('src', `${accountB.icon_file}`);
                $("#place-order-dialog-acount-b-label").html(`${accountB.broker}, ${accountB.account_number}`);

                document.getElementById('place-order-dialog-symbols').innerHTML = placeOrderDropdownSymbolsHTML();

            }
        })
        .modal('show')
}


function placeOrderDropdownSymbolsHTML() {
    var html = '<option value="">Select</option>';
    for (var n in AppConfig.symbol) {
        html += `<option value="${n}">${n}</option>`
    }

    return html;
}

function getPeerBroker(broker) {
    for (var n in paired_accounts) {
        var pair = paired_accounts[n];
        if (pair[0].broker == broker) {
            return pair[1].broker
        }
        if (pair[1].broker == broker) {
            return pair[0].broker
        }

    }
}

function hideCenterContents() {
    $("#center-content-main").hide();
    $("#center-content-pairing").hide();
    $("#center-content-metrics").hide();
    $("#center-content-symbols-configuration").hide();
    $("#center-content-output").hide();
    $("#center-content-settings").hide();

    $('#btn-main').removeClass('active');
    $('#btn-pairing').removeClass('active');
    $('#btn-metrics').removeClass('active');
    $('#btn-symbols-configuration').removeClass('active');
    $('#btn-output').removeClass('active');
    $('#btn-settings').removeClass('active');
}

function showMain(){

    hideCenterContents();
    $('#btn-main').addClass('active');
    $('#center-content-main').fadeIn();
}

function displayMetrics() {
    var html = orderMetricsHTML();
    if (html) {
        document.getElementById('center-content-metrics').innerHTML = html;
    }
}


function displaySymbolsConfiguration(edit, add, saved) {

    var html = symbolsConfigurationHTML(edit, add, saved);
    if (html) {
        document.getElementById('center-content-symbols-configuration').innerHTML = html;
    }
}

function AddConfigSymbol() {
    displaySymbolsConfiguration(false, true);
}

function EditConfigSymbol() {
    displaySymbolsConfiguration(true, false);
}

function SaveConfigSymbol() {
    var table = document.getElementById('center-content-symbols-configuration-table');
    if (!table) {
        return;
    }

    var rows = table.rows;

    var rel_broker_symbols = {};

    var symbols_spread = {};

    for (var i = 0; i < rows.length; i++) {
        if (rows[i].className == 'center-content-symbols-configuration-row') {
            var cells = rows[i].children;
            var general_symbol = '';
            for (var k = 0; k < cells.length; k++) {

                var td = cells[k];
                var value = '';
                
                if (td.firstChild && td.firstChild.tagName.toLowerCase() == 'input') {
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

                if (general_symbol == '') {
                    continue;
                }

                if (k == 1) {
                    symbols_spread[general_symbol] = value;
                    continue;
                }

                rel_broker_symbols[general_symbol][td.dataset.broker] = value;
            }
            
        }
    }


    var app_config = {};

    //copy form AppConfig
    for (var n in AppConfig) {
        app_config[n] = AppConfig[n];
    }

    //modify
    app_config['symbol'] = rel_broker_symbols;
    app_config['spread'] = symbols_spread;

    ipc.send('save-symbols-config', app_config);
}

function SaveSettings() {
    var only_pair_live_accounts_with_same_account_name = document.getElementById('settings-only-pair-live-accounts-with-same-account-name').checked;
    var sync_check_interval_in_seconds = document.getElementById('settings-sync-check-interval-in-seconds').value;
    var maximum_log_records = document.getElementById('settings-maximum-log-records').value;

    var app_config = {
    };

    //copy form AppConfig
    for (var n in AppConfig) {       
       app_config[n] = AppConfig[n];       
    }

    //modify
    app_config['only_pair_live_accounts_with_same_account_name'] = only_pair_live_accounts_with_same_account_name;
    app_config['sync_check_interval_in_seconds'] = sync_check_interval_in_seconds;
    app_config['maximum_log_records'] = maximum_log_records;

    ipc.send('save-settings', app_config);

}

function settings(saved) {

    document.getElementById('settings-only-pair-live-accounts-with-same-account-name').checked = AppConfig['only_pair_live_accounts_with_same_account_name'];
    document.getElementById('settings-sync-check-interval-in-seconds').value = AppConfig['sync_check_interval_in_seconds'] || DEFAULT_SYNC_CHECK_INTERVAL;

    MaxLogRecords = (AppConfig['maximum_log_records'] || MaxLogRecords) - 0;//implicitly convert to numeric
    document.getElementById('settings-maximum-log-records').value = MaxLogRecords;


    //feed back
    if (saved === true) {
        document.getElementById('settings-feedback').className = "ui success message"
        document.getElementById('settings-message-title').innerHTML = 'Success';
        document.getElementById('settings-message-body').innerHTML = 'Saved settings successfully';
        document.getElementById('settings-feedback').style.display = "block";
        $('settings-feedback').fadeIn();
    } else if (saved === false) {
        document.getElementById('settings-feedback').className = "ui error message"
        document.getElementById('settings-message-title').innerHTML = 'Failed';
        document.getElementById('settings-message-body').innerHTML = 'Failed to save the settings';
        document.getElementById('settings-feedback').style.display = "block";
        $('settings-feedback').fadeIn();
    } else {
        $('settings-feedback').hide();
        document.getElementById('settings-feedback').className = ""
        document.getElementById('settings-message-title').innerHTML = '';
        document.getElementById('settings-message-body').innerHTML = '';
        
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
        if (order.ticket != -1 && order.peer_ticket != -1 && !paired_orders[order.peer_ticket]) {
            paired_orders[order.ticket] = order;
        }

        //store all orders by their tickets
        orders[order.ticket] = order;
    }
}

function orderMetricsHTML() {

    var tables = '';
    

    for (var n in orders) {

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
                                        ${order.ticket}                                       
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
                    <td rowspan="3">${remarkForStoplossChange(orders_a, orders_b)}</td>
                  </tr>
                  <tr>
                    <td>MODIFY TARGET SIGNAL TIME</td>
                    <td>${cellContent(order_a.modify_target_signal_time)}</td>
                    <td>${cellContent(order_b.modify_target_signal_time)}</td>
                  </tr>
                  <tr>
                    <td>MODIFY TARGET EXECUTION TIME</td>
                    <td>${cellContent(order_a.modify_target_execution_time)}</td>
                    <td>${cellContent(order_b.modify_target_execution_time)}</td>
                  </tr>
                  <tr>
                    <td>TARGET CHANGED TIME</td>
                    <td>${cellContent(order_a.target_change_time)}</td>
                    <td>${cellContent(order_b.target_change_time)}</td>
                    <td rowspan="3">${remarkForTargetChange(orders_a, orders_b)}</td>
                  </tr>
                  <tr>
                    <td>MODIFY STOPLOSS SIGNAL TIME</td>
                    <td>${cellContent(order_a.modify_stoploss_signal_time)}</td>
                    <td>${cellContent(order_b.modify_stoploss_signal_time)}</td>
                  </tr>
                  <tr>
                    <td>MODIFY STOPLOSS EXECUTION TIME</td>
                    <td>${cellContent(order_a.modify_stoploss_execution_time)}</td>
                    <td>${cellContent(order_b.modify_stoploss_execution_time)}</td>
                  </tr>`;
    

    return tbody;
}


function symbolsConfigurationHTML(edit, add, saved) {

    var brokers = getAllBroker();    
    var rows;
    var td = '';

    for (var k in brokers) {
        td += `<td  class="definition">${brokers[k]}</td>`;
    }

    var head_row = `<tr>
                         <td rowspan="2">Symbol</td>
                         <td  class="definition" rowspan="2">Spread</td>   
                         <td class="definition" colspan="${brokers.length}">Brokers Relative Symbols</td>
                    </tr>
                    <tr>
                        ${td}
                    </tr>`;

    td = '';//initialize
    var body_rows = ''
    for (var i in AppConfig.symbol) {
        //i is the general symbol
        var spread = AppConfig.spread[i];
        var td = `<td  class="definition">${symbolCell(i, edit, true)}</td><td>${spreadCell(spread, edit, true)}</td>`;

        for (var k in brokers) {
            var relative_symbol = '';
            var broker = brokers[k];
            if (AppConfig.symbol[i][broker]) {
                relative_symbol = AppConfig.symbol[i][broker]
            }
            td += `<td data-broker='${broker}'>${symbolCell(relative_symbol, edit)}</td>`;
        }

        body_rows += `<tr class='center-content-symbols-configuration-row'>${td}</tr>`;
    }
    
    if (add) {
        td = `<td class="definition">${symbolCell('', true, true)}</td><td>${spreadCell('', true, true)}</td>`;
        for (var k in brokers) {
            var broker = brokers[k];
            td += `<td data-broker='${broker}'>${symbolCell('', true)}</td>`;
        }
        body_rows += `<tr class='center-content-symbols-configuration-row'>${td}</tr>`;
    }

    var saveTr = '';

    if (saved === true || saved === false) {
        var strSave = "Could not save!";
        if (saved) {
            strSave = "Saved successfully!";
        }
        saveTr = `<div class="ui success message">
                    ${strSave}                   
                  </div>`
    }

    var table = `<div style='width: 100%; overflow: auto; margin-bottom: 20px; padding-top: 20px;'>
                        <table  class="ui compact celled definition structured table sixteen wide column" id='center-content-symbols-configuration-table'>
                         <thead>
                           ${head_row} 
                         </thead>
                         <tbody>
                           ${body_rows} 
                         </tbody>
                         <tfoot>
                              <tr>
                                <th colspan="${brokers.length +2}"></th>
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
    var base_style = '';
    if (base) {
        base_style = "width: 80px;; float: left;";
    }
    var edit_include = edit ? ` style="${base_style}"` : `readonly ="readonly" style="${base_style} border:none; outline: none; color: inherit; background: inherit; font-weight: inherit; font-size: inherit; font-style: inherit;"`;
    return `<input type="text" ${edit_include} value ='${symbol}'/>`;            
}

function spreadCell(spread, edit, base) {
    var base_style = '';
    if (base) {
        base_style = "width: 60px; ; float: right;";
    }
    if (!spread) {
        spread = 0;
    }
    var edit_include = edit ? ` style="${base_style}"` : `readonly ="readonly" style="${base_style} border:none; outline: none; color: inherit; background: inherit; font-weight: inherit; font-size: inherit; font-style: inherit;"`;
    return `<input type="number" ${edit_include} value ='${spread}' min='0'/>`;
}

function cellContent(str, alt) {

    if (alt === undefined || alt === null) {
        alt = '-';
    }


    var content = str;

    return content;
}

function orderMetricsTableContentID(order) {
    return `table-${order.ticket}`;
}

function orderMetricsTableColumnAID(order) {
    return `table-col-a-${order.ticket}`;
}

function orderMetricsTableColumnBID(order) {
    return `table-col-b-${order.peer_ticket}`;
}

function getAccount(broker, account_number) {
    for (var i in unpaired_accounts) {
        if (unpaired_accounts[i].broker == broker && unpaired_accounts[i].account_number == account_number) {
            return unpaired_accounts[i];
        }
    }

    for (var i in paired_accounts) {
        var accountA = paired_accounts[i][0];
        var accountB = paired_accounts[i][1];

        if (accountA.broker == broker && accountA.account_number == account_number) {
            return accountA;
        }

        if (accountB.broker == broker && accountB.account_number == account_number) {
            return accountB;
        }
    }
} 

function pairingComponent() {

    if (Object.keys(paired_accounts).length > 0 && unpaired_accounts.length == 0) {
        document.getElementById('pairing-number-info').innerHTML = 'All accounts are paired!';
        document.getElementById('pairing-number-info').style.color = '#4DBD33';
    }

    if (unpaired_accounts.length > 0) {
        document.getElementById('pairing-number-info').innerHTML = unpaired_accounts.length > 1 ?
            `${unpaired_accounts.length}  accounts remain unpaired!` :
            `${unpaired_accounts.length}  account remains unpaired!`;

        document.getElementById('pairing-number-info').style.color = '#222222';
    }


    populatePairingDropdownA();
    populatePairingDropdownB();
    populatePairedAccountTable();
}

function populatePairingDropdownA() {
    
    var el = document.getElementById("pairing-accounts-dropdown-a")
    var menu = el.querySelector('.menu');

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

            if (broker == unpaired_broker
                && account_number == unpaired_account_number) {
                found = true;
                break;
            }

            //also check if the other dropdown has selected it so as to exclude it from the list in the dropdown
            if (selectedPairingAccountB
                && selectedPairingAccountB.broker == broker
                && selectedPairingAccountB.account_number == account_number) {
                found = true;
                menu.removeChild(child);
                break;
            }


        }


        if (!found) {
            var account = getAccount(unpaired_broker, unpaired_account_number);
            menu.insertAdjacentHTML('beforeend', dropdownAccountItemHTML(account));
        }

    }


    $('#pairing-accounts-dropdown-a')
        .dropdown({
            onChange: function (value, text, $selectedItem) {

                if (!$selectedItem) {
                    return;
                }

                selectedPairingAccountA = getAccount($selectedItem[0].dataset.broker, $selectedItem[0].dataset.accountNumber);

                populatePairingDropdownB();//update the other dropdown to exclude the selected one

                console.log(value);
                console.log(text);
                console.log($selectedItem);

            }
        });

}

function populatePairingDropdownB() {

    var el = document.getElementById("pairing-accounts-dropdown-b")
    var menu = el.querySelector('.menu');

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

            if (broker == unpaired_broker
                && account_number == unpaired_account_number) {
                found = true;
                break;
            }

            //also check if the other dropdown has selected it so as to exclude it from the list in the dropdown
            if (selectedPairingAccountA
                && selectedPairingAccountA.broker == broker
                && selectedPairingAccountA.account_number == account_number) {
                found = true;
                menu.removeChild(child);
                break;
            }
        }


        if (!found) {
            var account = getAccount(unpaired_broker, unpaired_account_number);
            menu.insertAdjacentHTML('beforeend', dropdownAccountItemHTML(account));
        }

    }



    $('#pairing-accounts-dropdown-b')
        .dropdown({
            onChange: function (value, text, $selectedItem) {

                if (!$selectedItem) {
                    return;
                }

                selectedPairingAccountB = getAccount($selectedItem[0].dataset.broker, $selectedItem[0].dataset.accountNumber);

                populatePairingDropdownA();//update the other dropdown to exclude the selected one


                console.log(value);
                console.log(text);
                console.log($selectedItem);

            }
        });
        

}

function populatePairedAccountTable() {

    var table = document.getElementById("pairing-accounts-paired-table")
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

            var cellAcountA = row.cells[1].firstElementChild;//second cell
            var cellAcountB = row.cells[2].firstElementChild;//third cell

            if (!cellAcountA.dataset || !cellAcountB.dataset) {
                continue;
            }

            var brokerA = cellAcountA.dataset.broker;
            var account_numberA = cellAcountA.dataset.accountNumber;

            var brokerB = cellAcountB.dataset.broker;
            var account_numberB = cellAcountB.dataset.accountNumber;

            if ((brokerA == paired_brokerA
                && account_numberA == paired_account_numberA
                && brokerB == paired_brokerB
                && account_numberB == paired_account_numberB)
                ||
                (brokerA == paired_brokerB
                    && account_numberA == paired_account_numberB
                    && brokerB == paired_brokerA
                    && account_numberB == paired_account_numberA)) {
                found = true;
                break;
            }

        }


        if (!found) {
            var accountA = getAccount(paired_brokerA, paired_account_numberA);
            var accountB = getAccount(paired_brokerB, paired_account_numberB);
            document.getElementById('pairing-accounts-paired-tbody').insertAdjacentHTML('beforeend', tablePairdAccountRowHTML(accountA, accountB));
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

            var cellAcountA = row.cells[1].firstElementChild;//second cell
            var cellAcountB = row.cells[2].firstElementChild;//third cell

            if (!cellAcountA.dataset || !cellAcountB.dataset) {
                continue;
            }

            var brokerA = cellAcountA.dataset.broker;
            var account_numberA = cellAcountA.dataset.accountNumber;

            var brokerB = cellAcountB.dataset.broker;
            var account_numberB = cellAcountB.dataset.accountNumber;

            if ((brokerA == unpaired_broker
                && account_numberA == unpaired_account_number)
                ||
                (brokerB == unpaired_broker
                    && account_numberB == unpaired_account_number)) {

                //remove the row since the account is unpaired
                row.parentNode.removeChild(row);

                break;
            }

        }

    }

    $('.ui.checkbox').checkbox();

}

function dropdownAccountItemHTML(account) {
    if (!account) {
        return '';
    }
    return `<div class="item" data-broker="${account.broker}" data-account-number="${account.account_number}" ">
                    <img class="ui avatar image" src="${account.icon_file}">
                    <div class="content">
                        <a class="header">${account.broker}</a>
                        <div class="description">${account.account_number} - ${accountTypeText(account)} on ${account.platform_type}</div>
                    </div>
                </div>`;
}

function tablePairdAccountRowHTML(accountA, accountB) {
    if (!accountA || !accountB) {
        return '';
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
                <div class="item" data-broker="${accountA.broker}" data-account-number="${accountA.account_number}" ">
                        <img class="ui avatar image" src="${accountA.icon_file}">
                        <div class="content">
                            <a class="header">${accountA.broker}</a>
                            <div class="description">${accountA.account_number} - ${accountTypeText(accountA)} on ${accountA.platform_type}</div>
                        </div>
                 </div>
            </td>

            <!--3rd cell-->
            <td>
                <div class="item" data-broker="${accountB.broker}" data-account-number="${accountB.account_number}" ">
                        <img class="ui avatar image" src="${accountB.icon_file}">
                        <div class="content">
                            <a class="header">${accountB.broker}</a>
                            <div class="description">${accountB.account_number} - ${accountTypeText(accountB)} on ${accountB.platform_type}</div>
                        </div>
                </div>
            </td>

            <!--4th cell-->
            <td>
                <div class="ui small primary labeled icon button" onclick="showPairedByPairID('${accountA.pair_id}')">
                                <i class="sync icon"></i> Goto
                </div>
            </td>

            </tr>`;
}

function getSelectedPairingsToRemove() {

    var table = document.getElementById("pairing-accounts-paired-table")
    var rows = table.rows;

    var pairs = [];

    for (var k = 0; k < rows.length; k++) {
        var row = rows[k];

        if (row.cells.length != 4) {
            continue;
        }

        var cellCheckBox = row.cells[0].firstElementChild.firstElementChild;//first cell

        if (!cellCheckBox.checked) {
            continue;
        }

        var cellAcountA = row.cells[1].firstElementChild;//second cell
        var cellAcountB = row.cells[2].firstElementChild;//third cell

        if (!cellAcountA.dataset || !cellAcountB.dataset) {
            continue;
        }

        var brokerA = cellAcountA.dataset.broker;
        var account_numberA = cellAcountA.dataset.accountNumber;

        var brokerB = cellAcountB.dataset.broker;
        var account_numberB = cellAcountB.dataset.accountNumber;

        var accountA = getAccount(brokerA, account_numberA);
        var accountB = getAccount(brokerB, account_numberB);

        var pair = [accountA, accountB];

        pairs.push(pair);
    }

    return pairs
}

function addInfoLog(str_log) {
    addLog(str_log, 'info');
}


function addSuccessLog(str_log) {
    addLog(str_log, 'success');
}


function addErrorLog(str_log) {
    addLog(str_log, 'error');
}

function addLog(str_log, type) {
    

    var logObj = {
        type: type,
        time: new Date(),
        data: str_log
    };

    logs.push(logObj);
    if (logs.length > MaxLogRecords) {
        logs.shift();//remove the first element
    }

    document.getElementById('output-count').innerHTML = logs.length;
    
    if ($('#btn-output').hasClass('active')) {
        displayLog();
    }
    
}

function displayLog() {

    var html = '';
    var timezone = '';
    var cell_padding = ' style = "padding-top:3px !important;padding-bottom:3px !important;"';
    
    for (var i = logs.length - 1; i > -1; i--) {
        var objLog = logs[i];
        if (!timezone) {
            //alert((objLog.time + ""));
            timezone = (objLog.time + "").substring(25, 33);
        }
        var date_arr = new Date(objLog.time.getTime() - (objLog.time.getTimezoneOffset() * 60000))
            .toISOString()
            .split("T");
        var date_time = date_arr[0] + ' '+date_arr[1].substring(0, 8);

        var icon = '';
        switch (objLog.type) {
            case 'info': icon = 'info circle icon'; break;
            case 'success': icon = 'check circle green icon'; break;
            case 'error': icon = 'close icon icon red'; break;
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
        document.getElementById('center-content-output').innerHTML = html;
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

        if ((accountA.broker == broker && accountA.account_number == account_number)
            || (accountB.broker == broker && accountB.account_number == account_number)) {
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

    alert(cursorIndex);//TESTING!!!
}

function showPreviousPaired() {
    cursorPrev();
    refreshPairedTable();

    alert(cursorIndex);//TESTING!!!
}

function RefreshSync() {
    ipc.send('refresh-sync', true);
}

function refreshPairedTable() {
    pair = currentPair();
    var html = pairedAccountHTML(pair);
    if (html) {
        document.getElementById('center-content-main').innerHTML = html;
    }
}

function refreshActionList() {
    var html = accountListHTML();
    if (html) {
        document.getElementById('right-pane').innerHTML = html;


        $('.account-list-item-popup-menu')
            .popup({
                //inline: true,
                //hoverable: true,
                //position: 'bottom left',
                delay: {
                    show: 300,
                    hide: 800
                }
            });
           
    }
}

function getAllBroker() {
    var brokers = [];
    for (var n in paired_accounts) {
        var brokerA = paired_accounts[n][0].broker;
        var brokerB = paired_accounts[n][1].broker;

        if (brokers.findIndex(obj => brokerA == obj.broker) == -1) {
            brokers.push(brokerA);
        }

        if (brokers.findIndex(obj => brokerB == obj.broker) == -1) {
            brokers.push(brokerB);
        }

    }


    for (var n in unpaired_accounts) {
        var broker = unpaired_accounts[n].broker;

        if (brokers.findIndex(obj => broker == obj.broker) == -1) {
            brokers.push(broker);
        }

    }


    return brokers;
}

function setAccount(account) {
    if (!account.broker || !account.account_number) {
        console.warn('broker or account number not unknown - did you mean account?');
        return false;
    }


    storeOrder(account);

    //remove from unpaired 
    removeUnpaired(account);
    removeUnpaired(account.peer);// safe since we check for null

    if (account.peer) {
        paired_accounts[account.pair_id] = [];
        paired_accounts[account.pair_id][account.column_index] = account;
        paired_accounts[account.pair_id][account.peer.column_index] = account.peer;

        console.log('setAccount 1');

    } else {

        console.log('setAccount 2');

        addUnpaired(account);
    }

    console.log('UNPAIED COUNT ', unpaired_accounts.length);
    if (paired_accounts[account.pair_id]) {
        console.log(`PAIED COUNT ${account.pair_id}`, paired_accounts[account.pair_id].length);
    }
        console.log(`PAIED COUNT `, Object.keys(paired_accounts).length);

    return true;
}

function removeUnpaired(account) {
    if (!account) {
        return;
    }

    var objIndex = unpaired_accounts.findIndex(obj => obj.broker === account.broker && obj.account_number === account.account_number);
    if (objIndex > -1) {
        unpaired_accounts.splice(objIndex, 1);
    } 

}

function addUnpaired(account) {
    if (!account.broker || !account.account_number) {
        console.warn('broker or account number not known - did you mean account?');
        return;
    }
    const objIndex = unpaired_accounts.findIndex(obj => obj.broker === account.broker && obj.account_number === account.account_number);
    if (objIndex == -1) {

        console.log('addUnpaired 1');

        unpaired_accounts.push(account);
    } else {

        console.log('addUnpaired 2');

        unpaired_accounts[objIndex] = account;
    }
}

function removeAccount(account) {

    //paid_id may be empty so we will find and delete - longer but safer approach
    for (n in paired_accounts) {
        var pair = paired_accounts[n];
        if ((pair[0].broker == account.broker && pair[0].account_number == account.account_number)
            || (pair[1].broker == account.broker && pair[1].account_number == account.account_number)) {
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

    var tables = '';
    var tbody = '';

    var accountA = pair[0];
    var accountB = pair[1];

    var table = `
            <div class="ui teal segment">

                <div class="ui left floated small primary labeled icon button" onclick="PlaceOrder()">
                      <i class="paper plane icon"></i> Place Order
                </div>


                <div class="ui right floated pagination menu">
                        
                        <a class="icon item ${cursorIndex == 0 ? 'disabled' : ''}" onclick="showPreviousPaired()">
                          <i class="left chevron icon"></i>
                        </a>
                        <div class="item">
                        <span>${cursorIndex + 1}</span><span style="padding-left:10px;padding-right:10px;">of</span><span>${Object.keys(paired_accounts).length}</span>
                        </div>
                        <a class="icon item ${cursorIndex == Object.keys(paired_accounts).length - 1 ? 'disabled' : ''}"  onclick="showNextPaired()">
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
                                            ${accountA.account_number} - ${accountTypeText(accountA)} on ${accountA.platform_type}
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
                                            ${accountB.account_number} - ${accountTypeText(accountB)} on ${accountB.platform_type}
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
    var tbody = '';
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
                    <td>${order_a.symbol ? order_a.symbol : '-'}</td>
                    <td>${order_b.symbol ? order_b.symbol : '-'}</td>
                  </tr>
                  <tr>
                    <td>POSITION</td>
                    <td>${order_a.position ? order_a.position : '-'}</td>
                    <td>${order_b.position ? order_b.position : '-'} </td>
                  </tr>
                  <tr>
                    <td>TICKET</td>
                    <td>${order_a.ticket ? order_a.ticket : '-'}</td>
                    <td>${order_b.ticket ? order_b.ticket : '-'} </td>
                  </tr>
                  <tr>
                    <td>SPREAD</td>
                    <td>${order_a.spread || order_a.spread == 0 ? order_a.spread : '-'}</td>
                    <td>${order_b.spread || order_a.spread == 0 ? order_b.spread : '-'} </td>
                  </tr>
                  <tr>
                    <td>TARGET</td>
                    <td>${order_a.target || order_a.target == 0 ? order_a.target : '-'}</td>
                    <td>${order_b.target || order_a.target == 0 ? order_b.target : '-'} </td>
                  </tr>
                  <tr>
                    <td>STOPLOSS</td>
                    <td>${order_a.stoploss || order_a.stoploss == 0 ? order_a.stoploss : '-'}</td>
                    <td>${order_b.stoploss || order_a.stoploss == 0 ? order_b.stoploss : '-'} </td>
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
    if (!account || (account.is_market_closed !== true && account.is_market_closed !== false)) {
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
    if (order.open_time > 0 && order.close_time == 0)
        return 'OPEN';
    if (order.open_time > 0 && order.close_time > 0)
        return 'CLOSED';
    return 'UNKNOWN';
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
    var SendingCopyHtml = SyncMessage('Sending copy...');
    var ReceivingCopyHtml = SyncMessage('Receiving copy...');

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

        console.log(ReceivingCopyHtml);

        return ReceivingCopyHtml;
    }


    //--Sending close trade indicator

    var SendingCloseHtml = SyncMessage('Sending close...');
    var ReceivingCloseHtml = SyncMessage('Receiving close...');

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
    var SendingModifyTargetHtml = SyncMessage('Sending modify target...');
    var ReceivingModifyTargetHtml = SyncMessage('Receiving modify target...');


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
    var SendingModifyStoplossHtml = SyncMessage('Sending modify stoploss...');
    var ReceivingModifyStoplossHtml = SyncMessage('Receiving modify stoploss...');


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
        return '-';
    }

    if (!order_b.symbol && column_index == 1) {
        return '-';
    }

    return '<i class="large green checkmark icon"></i>';//Tick mark
}

function accountListHTML() {
    var html = '';
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

    var parentNode = document.getElementById('right-pane');
    var elementList = parentNode.querySelectorAll('.account-list-item');
    for (i = 0; i < elementList.length; i++) {
        var element = elementList[i];

        if (element.dataset.broker == account.broker && element.dataset.accountNumber == account.account_number) {
            element.querySelector('.account-list-item-label-paired').innerHTML = status;
            
        }

        if (account.peer && (status == PAIRED || status == NOT_PAIRED)) {
            if (element.dataset.broker == account.peer.broker && element.dataset.accountNumber == account.peer.account_number) {
                element.querySelector('.account-list-item-label-paired').innerHTML = status;

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
    return `<div class="item account-list-item" data-broker="${account.broker}" data-account-number="${account.account_number}"  onclick="showPaired('${account.broker}','${account.account_number}')">
                    <div class="right floated content" style="width: auto !important;">
                      <div class="ui dropdown  right floated"  style="margin-bottom: 2px; margin-right: 5px; min-width: 60px; text-align: right;">
                          <i class="account-list-item-popup-menu">${accountTypeText(account)} - ${account.platform_type}</i>
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
    return `table-${getPairID(account)}`;
}

function tableColumnAID(account) {
    return `table-col-a-${getPairID(account)}`;
}

function tableColumnBID(account) {
    return `table-col-b-${getPairID(account)}`;
}

function getPairID(account) {
    var id = account.broker + "-" + account.account_number;
    var id = id.replace(new RegExp(' ', 'g'), '-');
    return id;
}
