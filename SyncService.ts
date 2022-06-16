
import guiMsgBox from "./main";
import { ipcSend, Shutdown }  from "./main";
import { App, fs, path, mkdirp, readline } from "./app";
import { TraderAccount } from "./TraderAccount";
import { Order } from "./Order";
import { SyncTraderException } from "./SyncTraderException";
import { SyncUtil } from "./SyncUtil";
import {
  AccountOrderPlacement,
  PairAccount,
  PairOrder,
  PairBitOrder,
  StringBoolNull,
} from "./Types";
import { MessageBuffer } from "./MessageBuffer";
import { Config } from "./Config";
import { Constants } from "./Constants";
import { OrderPlacement } from "./OrderPlacement";
import { Emailer } from "./Emailer";
import { PlaceOrderTrigger } from "./PlaceOrderTrigger";
import { InstallController } from "./InstallController";

export class SyncService {
  private pairedAccounts: Array<PairAccount> = new Array();
  private unpairedAccounts: Array<TraderAccount> = new Array();
  private readonly PING_INTERVAL: number = 1000;
  private RoutineSyncChecksIntervalID;
  private RoutineRefreshAccountInfoIntervalID;

  private LastRoutineSyncChecksInterval: number = 0;
  private LastRoutineRefreshAccountInfoInterval: number = 0;
  private PlaceOrdersTriggerList: Array<PlaceOrderTrigger> = new Array<PlaceOrderTrigger>();

  //ROUTINE SYNC CHECKS INTERVAL
  private RoutineSyncChecksInterval: Function = function (): number {
    var default_val = 10;
    var val =
      SyncUtil.AppConfigMap.get("sync_check_interval_in_seconds") - 0 ||
      default_val;
    return (val <= 0 ? default_val : val) * 1000;
  };

  private RoutineRefreshAccountInfoInterval: Function = function (): number {
    var default_val = 10;
    var val =
      SyncUtil.AppConfigMap.get("refresh_account_info_interval_in_seconds") -
        0 || default_val;
    return (val <= 0 ? default_val : val) * 1000;
  };

  //collection of all successfully synchronized trades - this will be loaded from the
  //database. after every successful synchronizatio this collection must be updated
  //and saved to the database. This is the collections that will be used to check if
  //the paired trades are actually synchronized.
  //the Keys of the dictinary is the PairIDs while the Values are the paired order tickets
  //of the respective trades successfully synchronized (copied)

  syncOpenBitOrderPairs: Map<string, PairBitOrder[]> = new Map<
    string,
    PairBitOrder[]
  >();
  syncClosedBitOrderPairs: Map<string, PairBitOrder[]> = new Map<
    string,
    PairBitOrder[]
  >();
  pendingAccountPlacementOrderMap: Map<
    string,
    AccountOrderPlacement[]
  > = new Map<string, AccountOrderPlacement[]>();

  private emailer: Emailer = new Emailer();

  private HandlerID: any;

  public Start() {
    try {
      SyncUtil.LoadAappConfig();

      //before we init app saved state and possibly clear files lets try
      //to read old sync logs to prevent duplicate sync copy of trades still open
      this.syncOpenBitOrderPairs = SyncUtil.LoadSavedSyncTrade();

      //Now check the version to know if the app will require clearing
      //saved properties the app uses
      SyncUtil.initAppSavedState();

      InstallController.Init();      

    } catch (e) {
      console.log(e);
      throw e;
    }

    //set timer for ping
    setInterval(this.OnTimedPingEvent.bind(this), this.PING_INTERVAL);

    this.CheckRoutineSyncChecksInterval();
    this.CheckRoutineRefreshAccountInfoInterval();

    //run the service handler
    this.HandlerID = setImmediate(this.Handler.bind(this));
  }

  private CheckPlaceOrderTriggerPermission(trigger: PlaceOrderTrigger) {
    //Ensure no open position otherwise reject this add operation.
    //Since the strategy is mainly maintaining one open trade per account

    if (!trigger.buy_trader.Peer()) {
      ipcSend(
        "place-order-trigger-rejected",
        `Peer for [${
          (trigger.buy_trader.Broker(), trigger.buy_trader.AccountNumber())
        }] is null`
      );
      return;
    }

    if (trigger.buy_trader.OpenOrdersCount() > 0) {
      ipcSend(
        "place-order-trigger-rejected",
        `Placing order trigger is not allowed if there is any open position - [${
          (trigger.buy_trader.Broker(), trigger.buy_trader.AccountNumber())
        }] has at least one open position`
      );
      return false;
    }

    if (trigger.buy_trader.Peer().OpenOrdersCount() > 0) {
      ipcSend(
        "place-order-trigger-rejected",
        `Placing order trigger is not allowed if there is any open position - [${
          (trigger.buy_trader.Peer().Broker(),
          trigger.buy_trader.Peer().AccountNumber())
        }] has at least one open position`
      );
      return false;
    }

    return true;
  }

  public AddPlaceOrderTrigger(trigger: PlaceOrderTrigger) {
    if (!this.CheckPlaceOrderTriggerPermission(trigger)) {
      return;
    }

    this.PlaceOrdersTriggerList.push(trigger);

    ipcSend("place-order-triggers", this.PlaceOrderTriggersSafecopies());

    //TESTING STARTS

    /* setTimeout(function () {
 
             trigger.buy_trader.SetChartMarketPrice(1833.45);
             trigger.buy_trader.Peer().SetChartMarketPrice(1833.45);
         
         }, 0);
 
         setTimeout(function () {
 
             trigger.buy_trader.SetAccountCredit(49);
             trigger.buy_trader.Peer().SetAccountCredit(49);
 
             trigger.buy_trader.SetAccountBalance(149);
             trigger.buy_trader.Peer().SetAccountBalance(149);
 
             trigger.buy_trader.SetChartMarketPrice(1895.45);
             trigger.buy_trader.Peer().SetChartMarketPrice(1895.45);
 
         }, 20000);*/

    //TESTING ENDS
  }

  public CancelPlaceOrderTrigger(uuid: string) {
    let found = false;
    for (let i = 0; i < this.PlaceOrdersTriggerList.length; i++) {
      let trigger = this.PlaceOrdersTriggerList[i];
      if (trigger.uuid == uuid) {
        found = true;
        if (!trigger.is_triggered) {
          this.PlaceOrdersTriggerList.splice(i, 1);

          ipcSend(
            "cancel-place-order-trigger-success",
            this.PlaceOrderTriggersSafecopies()
          );
        } else {
          ipcSend(
            "cancel-place-order-trigger-fail",
            "Cannot cancel place order trigger already triggered."
          );
        }
      }
    }

    if (!found) {
      ipcSend(
        "place-order-trigger-not-found",
        "Place order trigger not found."
      );
    }
  }

  private PlaceOrderTriggersSafecopies(): any[] {
    var arr = [];
    this.PlaceOrdersTriggerList.forEach((trigger) => {
      arr.push(trigger.Safecopy());
    });

    return arr;
  }


  public SyncPlaceOrders(
    traderAccountBUY: TraderAccount,
    traderAccountA: TraderAccount,
    traderAccountB: TraderAccount,
    symbol: string,
    lot_size_a: number,
    lot_size_b: number,
    trade_split_count: number,
    max_percent_diff_in_account_balances: number = Infinity,
    is_triggered: boolean = false
  ){

    if (!traderAccountBUY.Peer()) {
      return;
    }

    var position_a: string =
      traderAccountBUY.Broker() == traderAccountA.Broker() &&
      traderAccountBUY.AccountNumber() == traderAccountA.AccountNumber()
        ? Constants.BUY
        : Constants.SELL;

    var position_b: string =
      traderAccountBUY.Broker() == traderAccountB.Broker() &&
      traderAccountBUY.AccountNumber() == traderAccountB.AccountNumber()
        ? Constants.BUY
        : Constants.SELL;

    var max_percent = max_percent_diff_in_account_balances;    

    if(!traderAccountA.ValidatePlaceOrder(symbol, lot_size_a, max_percent, is_triggered) 
      || !traderAccountB.ValidatePlaceOrder(symbol, lot_size_b, max_percent, is_triggered)){
      return;
    }
    
    var paired_uuid_arr: Array<string> = new Array<string>();
    var trade_split_group_id_a = SyncUtil.Unique();
    var trade_split_group_id_b = SyncUtil.Unique();

    for(var i=0 ; i < trade_split_count; i++){
      var paired_uuid = SyncUtil.Unique();
      var placementA: OrderPlacement = null;
      var placementB: OrderPlacement = null;
          
      placementA = new OrderPlacement(
        paired_uuid,
        symbol,
        position_a,
        lot_size_a,
        trade_split_group_id_a,
        trade_split_count,
        is_triggered
      );
  
      placementB = new OrderPlacement(
        paired_uuid,
        symbol,
        position_b,
        lot_size_b,
        trade_split_group_id_b,
        trade_split_count,
        is_triggered
      );
  
      traderAccountA.SyncPlacingOrders.set(paired_uuid, placementA);
      traderAccountB.SyncPlacingOrders.set(paired_uuid, placementB);

      paired_uuid_arr.push(paired_uuid);

      var aop1: AccountOrderPlacement = [traderAccountA, placementA];
      var aop2: AccountOrderPlacement = [traderAccountB, placementB];

      this.pendingAccountPlacementOrderMap.set(paired_uuid, [aop1, aop2])
    }


    var afterCompleteValidation = ()=>{

      //clear off triggers for place order - the strategy does not permit allowing these triggers when any trade is open
      this.ClearPlaceOrderTriggers(
        "Placing order has cleared off all pending triggers."
      );
      
      for(var i=0 ; i < paired_uuid_arr.length; i++){
        this.handlePendingAccountOrderPlacement(paired_uuid_arr[i], true);
      }

    }
    
    // check enough money
    var a_success = false;
    var b_success = false;

    var a_prop = {
        symbol: SyncUtil.GetRelativeSymbol(symbol, traderAccountA.Broker(), traderAccountA.AccountNumber()),
        position: position_a, 
        lot_size : lot_size_a * trade_split_count // total lot size for the group          
    }

    var b_prop = {
      symbol: SyncUtil.GetRelativeSymbol(symbol, traderAccountB.Broker(), traderAccountB.AccountNumber()),
      position: position_b, 
      lot_size : lot_size_b * trade_split_count // total lot size for the group          
    }


    var command = Constants.CMD_CHECK_ENOUGH_MONEY;

    var err_prefix = is_triggered? "Trigger validation error!\n" : "";

    traderAccountA.sendEACommand(command, a_prop,(response: IResponse)=>{
        a_success =response.success; 
        if(a_success && b_success){//there is enough money so send
          afterCompleteValidation();
        }else if(!a_success){
          traderAccountA.SetLastError(`${err_prefix}${response.message}`);
          ipcSend("validate-place-order-fail", traderAccountA.Safecopy());
        }
    })

    traderAccountB.sendEACommand(command, b_prop, (response: IResponse)=>{
        b_success =response.success;
        if(a_success && b_success){//there is enough money so send
          afterCompleteValidation();
        }else if(!b_success){
          traderAccountB.SetLastError(`${err_prefix}${response.message}`);
          ipcSend("validate-place-order-fail", traderAccountB.Safecopy());
        }
    })
    
    
  }

  public GetEmailer(): Emailer {
    return this.emailer;
  }

  public AddClient(traderAccount: TraderAccount) {
    this.unpairedAccounts.push(traderAccount);
  }

  private OnTimedPingEvent() {
    this.eachAccount((acct: TraderAccount) => {
      acct.Ping();
    });
  }

  private CheckAlive(traderAccount: TraderAccount): boolean {
    if (traderAccount.IsConnected()) return true;

    //at this piont the connection is closed

    this.RemovePairing(traderAccount, true); //force remove pairing

    //dispose since we have unpaired it

    for (let unpaired of this.unpairedAccounts) {
      if (
        unpaired.Broker() === traderAccount.Broker() &&
        unpaired.AccountNumber() === traderAccount.AccountNumber()
      ) {
        SyncUtil.ArrayRemove(this.unpairedAccounts, traderAccount); //remove from unpaired list
        traderAccount.Dispose();
        traderAccount = null;
        break;
      }
    }

    return false;
  }

  public RemovePairing(
    traderAccount: TraderAccount,
    force_remove: boolean = false
  ) {
    if (!force_remove && traderAccount.IsSyncingInProgress()) {
      guiMsgBox.alert({
        title:'Error',
        message:`Could not remove pairing of ${traderAccount.Broker()}, ${traderAccount.AccountNumber()}.\n` +
        `Action denied because order syncing was detected!\n` +
        `It is unsafe to remove pairing when syncing is in progress except if it arised from account disconnection.`,
      })

      return;
    }

    for (let pair of this.pairedAccounts) {
      //consider first element of the pair
      if (pair[0] === traderAccount || pair[1] === traderAccount) {
        SyncUtil.ArrayRemove(this.pairedAccounts, pair);

        this.unpairedAccounts.push(pair[0]); //return back to unpaired list
        this.unpairedAccounts.push(pair[1]); //return back to unpaired list

        pair[0].ResetOrdersSyncing(); //reset all orders syncing to false
        pair[1].ResetOrdersSyncing(); //reset all orders syncing to false

        pair[0].RemovePeer();
        pair[1].RemovePeer();

        ipcSend("unpaired", [pair[0].Safecopy(), pair[1].Safecopy()]);

        break;
      }
    }
  }

  public getAccounts():Array<TraderAccount>{
      return this.getAccounts0();
  }

  public getMT4Accounts():Array<TraderAccount>{
    return this.getAccounts0('MT4');
  }

  public getMT5Accounts():Array<TraderAccount>{
    return this.getAccounts0('MT5');
  }

  private getAccounts0(mt: string = null):Array<TraderAccount>{
    var accounts = [];
    for (let unpaired of this.unpairedAccounts) {

      if (this.CheckAlive(unpaired)) {

        if(mt === 'MT4' && unpaired.IsMT4()){
          accounts.push(unpaired);
        }else if(mt === 'MT5' && unpaired.IsMT5()){
          accounts.push(unpaired);
        }else if (mt == null){
          accounts.push(unpaired);
        }

      }

    }

    for (let pair of this.pairedAccounts) {
      
      var pair0 = pair[0];
      var pair1 = pair[1];

      if (this.CheckAlive(pair0)) {
        if(mt === 'MT4' && pair0.IsMT4()){
          accounts.push(pair0);
        }else if(mt === 'MT5' && pair0.IsMT5()){
          accounts.push(pair0);
        }else if (mt == null){
          accounts.push(pair0);
        }        
      }

      if (this.CheckAlive(pair1)) {
        if(mt === 'MT4' && pair1.IsMT4()){
          accounts.push(pair1);
        }else if(mt === 'MT5' && pair1.IsMT5()){
          accounts.push(pair1);
        }else if (mt == null){
          accounts.push(pair1);
        }
      }
    }
    return accounts;
  }

  private eachAccount(callback: Function) {
    try {
      for (let unpaired of this.unpairedAccounts) {
        if (this.CheckAlive(unpaired)) {
          callback(unpaired);
        }
      }

      for (let pair of this.pairedAccounts) {
        if (this.CheckAlive(pair[0])) {
          callback(pair[0]);
        }

        if (this.CheckAlive(pair[1])) {
          callback(pair[1]);
        }
      }
    } catch (ex) {
      console.log(ex);
    }

    return;
  }

  private eachPairedAccount(callback: Function) {
    try {
      for (let pair of this.pairedAccounts) {
        this.CheckAlive(pair[0]);
        this.CheckAlive(pair[1]);
        callback(pair[0]);
        callback(pair[1]);
      }
    } catch (ex) {
      console.log(ex);
    }
  }

  private CheckRoutineSyncChecksInterval() {
    //set timer for routine validation checks

    var secs = this.RoutineSyncChecksInterval();
    if (this.LastRoutineSyncChecksInterval != secs) {
      clearTimeout(this.RoutineSyncChecksIntervalID);
      this.RoutineSyncChecksIntervalID = setInterval(
        this.RevalidateSyncAll.bind(this),
        secs
      );
      this.LastRoutineSyncChecksInterval = secs;
    }
  }

  private CheckRoutineRefreshAccountInfoInterval() {
    //set timer for refreshing account info on the gui
    var secs = this.RoutineRefreshAccountInfoInterval();
    if (this.LastRoutineRefreshAccountInfoInterval != secs) {
      clearTimeout(this.RoutineRefreshAccountInfoIntervalID);
      this.RoutineRefreshAccountInfoIntervalID = setInterval(
        this.RefreshAccountInfo.bind(this),
        secs
      );
      this.LastRoutineRefreshAccountInfoInterval = secs;
    }
  }

  private HandlePlaceOrderTriggers() {
    var any_triggered = false;
    for (let trigger of this.PlaceOrdersTriggerList) {
      if (!trigger.VerifyPair()) {
        continue;
      }
      if (!trigger.IsAccountBalanceDifferenceAllowed()) {
        continue;
      }

      if (
        trigger.type ==
          Constants.Instant_when_both_accounts_have_credit_bonuses ||
        trigger.type ==
          Constants.Pending_at_price_when_both_accounts_have_credit_bonuses
      ) {
        if (!trigger.IsBothAccountsHaveCredits()) {
          continue;
        }
      }

      if (
        trigger.type == Constants.Pending_at_price ||
        trigger.type ==
          Constants.Pending_at_price_when_both_accounts_have_credit_bonuses
      ) {
        if (!trigger.IsPriceTrigger()) {
          continue;
        }
      }

      //finally at this point there is a trigger
      any_triggered = true;

      this.PlaceOrderByTriger(trigger);

      break;
    }

    if (any_triggered) {
      //clear all triggers if any is triggered
      this.ClearPlaceOrderTriggers("All other triggers cleared off.");
    }
  }

  private ClearPlaceOrderTriggers(message: string = "") {
    if (this.PlaceOrdersTriggerList.length > 0) {
      this.PlaceOrdersTriggerList = new Array<PlaceOrderTrigger>(); // initialize

      ipcSend("place-order-triggers-clear", message);
    }
  }

  PlaceOrderByTriger(trigger: PlaceOrderTrigger) {
    if (!this.CheckPlaceOrderTriggerPermission(trigger)) {
      return;
    }

    trigger.is_triggered = true;

    this.SyncPlaceOrders(
      trigger.buy_trader,
      trigger.buy_trader,
      trigger.buy_trader.Peer(), //sell trader
      trigger.symbol,
      trigger.buy_lot_size,
      trigger.sell_lot_size,
      trigger.trade_split_count,
      trigger.max_percent_diff_in_account_balances,
      true
    );
  }

  public Shutdown(){
    clearImmediate(this.HandlerID);
    Shutdown(this.getAccounts());    
  }

  private Handler() {
    this.CheckRoutineSyncChecksInterval();
    this.CheckRoutineRefreshAccountInfoInterval();

    this.eachAccount((acct: TraderAccount) => {
      if (acct.HasReceived()) {
        this.HandleRead(acct, acct.ReceiveData());
      }
      try {
        this.emailer.Handler(acct);
        this.CheckPossibleLossPrevention(acct);
      } catch (ex) {
        console.log(ex);
      }
    });

    this.HandlePlaceOrderTriggers();

    this.HandlerID = setImmediate(this.Handler.bind(this));
    
  }

  private SendCopyToPeer(traderAccount: TraderAccount) {
    traderAccount.SendCopy(this.GetUnSyncedOrders(traderAccount));
  }

  private SendCloseToPeer(traderAccount: TraderAccount) {
    traderAccount.SendClose(this.GetSyncedOrders(traderAccount));
  }

  private SendModifyToPeer(traderAccount: TraderAccount) {
    traderAccount.SendModify(this.GetSyncedOrders(traderAccount));
  }

  public PairTraderAccountWith(
    traderAccount: TraderAccount,
    peerAccount: TraderAccount,
    is_gui: boolean = false
  ) {
    if (traderAccount == null || peerAccount == null) {
      if (is_gui) {
        guiMsgBox.alert({
          title: 'Failed',
          message:'One or two of the account to pair with is null.'
        });

      }
      return;
    }

    if (!traderAccount.IsKnown() || !peerAccount.IsKnown()) {
      if (is_gui) {
        guiMsgBox.alert({
          title: 'Failed',
          message:'one or two of the account to pair with is unknown - possibly no broker name or account number'
        });

      }
      return;
    }

    if (traderAccount.Version() != peerAccount.Version()) {
      if (is_gui) {
        guiMsgBox.alert({
          title: 'Failed',
          message:`EA version of [${traderAccount.Broker()}, ${traderAccount.AccountNumber()}] (${traderAccount.Version()}) mismatch with that of [${peerAccount.Broker()}, ${peerAccount.AccountNumber()}] (${peerAccount.Version()})  - version must be the same`
        });
      }
      return;
    }

    if (traderAccount.IsLiveAccount() === null) {
      if (is_gui) {
        guiMsgBox.alert({
          title: 'Failed',
          message:`account type of [${traderAccount.Broker()}, ${traderAccount.AccountNumber()}] is unknown  - must be live or demo`
        });
      }
      return;
    }

    if (peerAccount.IsLiveAccount() === null) {
      
      if (is_gui) {
        guiMsgBox.alert({
          title: 'Failed',
          message:`account type of [${peerAccount.Broker()}, ${peerAccount.AccountNumber()}] is unknown  - must be live or demo`
        });
  
      }
      return;
    }

    if (traderAccount.IsLiveAccount() !== peerAccount.IsLiveAccount()) {
      if (is_gui) {
        guiMsgBox.alert({
          title: 'Failed',
          message:'cannot pair up two accounts of different types - they both must be live or demo'
        });
      }
      return;
    }

    if (this.IsPaired(traderAccount)) {
      if (is_gui) {
        guiMsgBox.alert({
          title: 'Not Allowed',
          message:`[${traderAccount.Broker()}, ${traderAccount.AccountNumber()}] ` +
          `is already paired with [${traderAccount
            .Peer()
            .Broker()}, ${traderAccount.Peer().AccountNumber()}]!`
        });

      }
      return;
    }

    if (this.IsPaired(peerAccount)) {
      if (is_gui) {
        guiMsgBox.alert({
          title: 'Not Allowed',
          message:`[${peerAccount.Broker()}, ${peerAccount.AccountNumber()}] ` +
          `is already paired with [${peerAccount
            .Peer()
            .Broker()}, ${peerAccount.Peer().AccountNumber()}]!`
        });

      }
      return;
    }

    if (
      SyncUtil.AppConfigMap.get(
        "only_pair_live_accounts_with_same_account_name"
      ) === true
    ) {
      if (
        traderAccount.IsLiveAccount() &&
        peerAccount.IsLiveAccount() &&
        traderAccount.AccountName().toLowerCase() !=
          peerAccount.AccountName().toLowerCase()
      ) {
        if (is_gui) {          
          guiMsgBox.alert({
            title: 'Failed', 
            message: `Your app configuration settings does not permit pairing two live accounts with different account name:` +
                  `\n\nBroker: ${traderAccount.Broker()}\nAccount Number: ${traderAccount.AccountNumber()}\nAccount Name: ${traderAccount.AccountName()}` +
                  `\n---------------\nBroker: ${peerAccount.Broker()}\nAccount Number: ${peerAccount.AccountNumber()}\nAccount Name: ${peerAccount.AccountName()}` +
                  `\n\nHint: You can deselect the option in your app settings to remove this restriction.`
          });

        }
        return;
      }
    }

    for (let otherAccount of this.unpairedAccounts) {
      if (otherAccount != peerAccount) {
        continue;
      }

      //pair up the trader account

      traderAccount.SetPeer(otherAccount);
      otherAccount.SetPeer(traderAccount);

      let paired: PairAccount = [null, null];

      //assign to the appropriate column index
      paired[otherAccount.PairColumnIndex()] = otherAccount;
      paired[traderAccount.PairColumnIndex()] = traderAccount;

      this.pairedAccounts.push(paired);

      //remove from the unpaired list
      SyncUtil.ArrayRemove(this.unpairedAccounts, otherAccount);
      SyncUtil.ArrayRemove(this.unpairedAccounts, traderAccount);

      //now copy each other trades if neccessary
      this.SendCopyToPeer(traderAccount);
      this.SendCopyToPeer(otherAccount);

      traderAccount.EnsureTicketPeer(this.syncOpenBitOrderPairs);

      ipcSend("paired", traderAccount.Safecopy());

      break;
    }
  }

  private checkDuplicateEA(traderAccount: TraderAccount) {

    
    try {
      for (let unpaired of this.unpairedAccounts) {
        if (this.CheckAlive(unpaired)) {
          if(traderAccount !== unpaired && traderAccount.StrID() === unpaired.StrID()){
              return true;
          }
        }
      }

      for (let pair of this.pairedAccounts) {
        if (this.CheckAlive(pair[0])) {
          if(traderAccount !== pair[0] && traderAccount.StrID() === pair[0].StrID()){
              return true;
          }          
        }

        if (this.CheckAlive(pair[1])) {
          if(traderAccount !== pair[1] && traderAccount.StrID() === pair[1].StrID()){
              return true;
          }          
        }
      }
    } catch (ex) {
      console.log(ex);
    }

    return false;
  }

  public getTraderAccount(
    broker: string,
    account_number: string
  ): TraderAccount {
    for (let unpaired of this.unpairedAccounts) {
      if (
        unpaired.Broker() === broker &&
        unpaired.AccountNumber() === account_number
      ) {
        return unpaired;
      }
    }

    for (let pair of this.pairedAccounts) {
      //check the first
      if (
        pair[0].Broker() === broker &&
        pair[0].AccountNumber() === account_number
      ) {
        return pair[0];
      }

      //checkt the second
      if (
        pair[1].Broker() === broker &&
        pair[1].AccountNumber() === account_number
      ) {
        return pair[1];
      }
    }

    return null;
  }

  private getPeer(traderAccount: TraderAccount): TraderAccount {
    for (let pair of this.pairedAccounts) {
      //check the first
      if (
        pair[0].Broker() === traderAccount.Broker() &&
        pair[0].AccountNumber() === traderAccount.AccountNumber() &&
        (pair[1].Broker() !== traderAccount.Broker() ||
          pair[1].AccountNumber() !== traderAccount.AccountNumber())
      ) {
        return pair[1];
      }

      //chect the second
      if (
        pair[1].Broker() === traderAccount.Broker() &&
        pair[1].AccountNumber() === traderAccount.AccountNumber() &&
        (pair[0].Broker() !== traderAccount.Broker() ||
          pair[0].AccountNumber() !== traderAccount.AccountNumber())
      ) {
        return pair[0];
      }
    }

    return null;
  }

  private IsPaired(traderAccount: TraderAccount): boolean {
    return this.getPeer(traderAccount) != null;
  }

  private OnModifyTargetResult(
    traderAccount: TraderAccount,
    ticket: number,
    origin_ticket: number,
    new_target: number,
    success: boolean,
    error: string
  ) {
    if (traderAccount == null) return;

    var peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return;

    var origin_order = peerAccount.GetOrder(origin_ticket);
    if (origin_order) {
      origin_order.SyncModifyingTarget(false);
    }

    if (
      !success &&
      error != Constants.ERR_TRADE_CONDITION_NOT_CHANGED &&
      error != Constants.ERR_NO_CHANGES
    ) {
      var peer: TraderAccount = traderAccount.Peer();
      if (peer) {
        peer.RetrySendModifyTarget(origin_ticket, ticket, new_target);
      }
      return;
    }
  }

  private OnModifyStoplossResult(
    traderAccount: TraderAccount,
    ticket: number,
    origin_ticket: number,
    new_stoploss: number,
    success: boolean,
    error: string
  ) {
    if (traderAccount == null) return;

    var peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return;

    var origin_order = peerAccount.GetOrder(origin_ticket);
    if (origin_order) {
      origin_order.SyncModifyingStoploss(false);
    }

    if (
      !success &&
      error != Constants.ERR_TRADE_CONDITION_NOT_CHANGED &&
      error != Constants.ERR_NO_CHANGES
    ) {
      var peer: TraderAccount = traderAccount.Peer();
      if (peer) {
        peer.RetrySendModifyStoploss(origin_ticket, ticket, new_stoploss);
      }
      return;
    }
  }

  private DoOrderPair(
    traderAccount: TraderAccount,
    peerAccount: TraderAccount,
    ticket: number,
    peer_ticket: number
  ) {
    let pairId = traderAccount.PairID();
    let open_bit_order_pairs: Array<PairBitOrder> = new Array<PairBitOrder>();//modified111

    if (this.syncOpenBitOrderPairs.get(pairId)) {
      open_bit_order_pairs = this.syncOpenBitOrderPairs.get(pairId);
    } else {
      open_bit_order_pairs = new Array<PairBitOrder>();
    }

    let paired_bit_orders: PairBitOrder = [null, null];
    
    //assign to the appropriate column index

    //come back abeg o!!! traderAccount and peerAccount may not have the orders    
    paired_bit_orders[traderAccount.PairColumnIndex()] = traderAccount.GetOrder(ticket)?.snap(); //modified111
    paired_bit_orders[peerAccount.PairColumnIndex()] = peerAccount.GetOrder(peer_ticket).snap();//modified111

    open_bit_order_pairs.push(paired_bit_orders);
    this.syncOpenBitOrderPairs.set(pairId, open_bit_order_pairs);

    traderAccount.EnsureTicketPeer(this.syncOpenBitOrderPairs);

    this.SaveSyncState();
  }

  public handlePendingAccountOrderPlacement(uuid: string, send: boolean) {
    var accPl: Array<AccountOrderPlacement> = this.pendingAccountPlacementOrderMap.get(
      uuid
    );
    if (!accPl) {
      return;
    }
    if (send) {
      var traderAccount: TraderAccount = accPl[0][0];
      var placement: OrderPlacement = accPl[0][1];

      var peerAccount: TraderAccount = accPl[1][0];
      var peer_placement: OrderPlacement = accPl[1][1];

      if(placement.position == peer_placement.position){
        //Shocking!!! this error has occurred before so we put this measure to track and prevent it
        guiMsgBox.alert({
          title:'Invalid',
          message:`The position of both accounts cannot be the same - ${placement.position}`
        })  
      }else{        
        //now send
        traderAccount.PlaceOrder(placement);//old
        peerAccount.PlaceOrder(peer_placement);//old        
      }

    }

    this.pendingAccountPlacementOrderMap.delete(uuid);
  }

  private OnPlaceOrderResult(
    traderAccount: TraderAccount,
    ticket: number,
    uuid: string,
    success: boolean
  ) {
    if (traderAccount == null) return;

    var peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return;

    var placement: OrderPlacement = traderAccount.SyncPlacingOrders.get(uuid);
    var peer_placement: OrderPlacement = peerAccount.SyncPlacingOrders.get(
      uuid
    );

    if (!success) {
      if (!peerAccount.IsPlacementOrderClosed(uuid)) {
        //ensuring the peer order placement has not already closed
        var placement: OrderPlacement = traderAccount.SyncPlacingOrders.get(
          uuid
        );
        traderAccount.RetrySendPlaceOrderOrForceClosePeer(placement);
      } else {
        //Oops!!! the peer order placement has closed so just cancel and clear off the entries

        traderAccount.SyncPlacingOrders.delete(uuid);
        peerAccount.SyncPlacingOrders.delete(uuid);
      }
      return;
    }

    placement.SetResult(ticket);
    placement.SetOperationCompleteStatus(OrderPlacement.COMPLETE_SUCCESS);

    var order = traderAccount.GetOrder(ticket);
    if (order) {
      order.SetCopyable(false);
      order.SetGroupId(placement.trade_split_group_id);
      order.SetGroupOderCount(placement.trade_split_count);
    }

    //if peer did not complete with success status then focibly close this order
    if (
      peer_placement.OperationCompleteStatus() == OrderPlacement.COMPLETE_FAIL
    ) {
      var ticket: number = placement.ticket;
      var reason: string = traderAccount.ForceCloseReasonForFailedOrderPlacement(
        ticket
      );
      traderAccount.ForceCloseMe(ticket, reason); //forcibly close this order
      return 1;
    }

    if (
      placement.state != Constants.SUCCESS ||
      peer_placement.state != Constants.SUCCESS
    ) {
      return 1; //one done
    }

    this.DoOrderPair(
      traderAccount,
      peerAccount,
      placement.ticket,
      peer_placement.ticket
    );

    //clear off the placement orders entries
    traderAccount.SyncPlacingOrders.delete(uuid);
    peerAccount.SyncPlacingOrders.delete(uuid);

    return 2; //both done
  }

  private OnCopyResult(
    traderAccount: TraderAccount,
    ticket: number,
    origin_ticket: number,
    success: boolean
  ) {
    if (traderAccount == null) return;

    var peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return;

    var origin_order = peerAccount.GetOrder(origin_ticket);
    if (origin_order) {
      origin_order.SyncCopying(false);
    }

    if (!success) {
      var peer: TraderAccount = traderAccount.Peer();
      if (peer) {
        peer.RetrySendCopyOrForceCloseMe(origin_ticket);
      }
      return;
    }

    this.DoOrderPair(traderAccount, peerAccount, ticket, origin_ticket);
  }

  private OnCloseResult(
    traderAccount: TraderAccount,
    ticket: number,
    origin_ticket: number,
    success: boolean
  ) {
    if (traderAccount == null) return;

    var peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return;

    var origin_order = peerAccount.GetOrder(origin_ticket);
    if (origin_order) {
      origin_order.Closing(false);
    }

    if (!success) {
      var peer: TraderAccount = traderAccount.Peer();
      if (peer) {
        peer.RetrySendClose(origin_ticket, ticket);
      }
      return;
    }

    this.FinalizeCloseSuccess(traderAccount, ticket);
  }

  private OnOwnCloseResult(
    traderAccount: TraderAccount,
    ticket: number,
    success: boolean
  ) {
    if (traderAccount == null) return;

    var order = traderAccount.GetOrder(ticket);
    if (order) {
      order.Closing(false);
    }

    if (!success) {
      traderAccount.RetrySendClose(ticket, ticket);
      return;
    }

    //before we finalize lets ensure the peer order is also closed

    var peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return;

    var peer_order = peerAccount.GetOrder(order.peer_ticket);

    if (order.IsClosed() && peer_order && peer_order.IsClosed()) {
      this.FinalizeCloseSuccess(traderAccount, ticket);
    }
  }

  private FinalizeCloseSuccess(traderAccount: TraderAccount, ticket: number) {
    let pairId = traderAccount.PairID();

    let open_bit_order_pairs: Array<PairBitOrder> = new Array<PairBitOrder>();

    if (this.syncOpenBitOrderPairs.get(pairId)) {
      open_bit_order_pairs = this.syncOpenBitOrderPairs.get(pairId);
    } else {
      open_bit_order_pairs = new Array<PairBitOrder>();
    }

    //Remove the paired bit order from the list
    for (let bit_order_pair of open_bit_order_pairs) {
      let own_bit_order: BitOrder = bit_order_pair[traderAccount.PairColumnIndex()]; //modified111
      if (own_bit_order.ticket === ticket) {//modified111
        SyncUtil.ArrayRemove(open_bit_order_pairs, bit_order_pair);
        //transfer to closed ticket pairs
        var closed_ticket_pairs = this.syncClosedBitOrderPairs.get(pairId);
        if (!closed_ticket_pairs) {
          closed_ticket_pairs = new Array<PairBitOrder>();
        }
        closed_ticket_pairs.push(bit_order_pair);
        this.syncClosedBitOrderPairs.set(pairId, closed_ticket_pairs);
        break;
      }
    }

    this.syncOpenBitOrderPairs.set(pairId, open_bit_order_pairs);

    this.SaveSyncState();
  }
  /**
   * These are orders that have not been paired with its peer
   */

  private GetUnSyncedOrders(traderAccount: TraderAccount): Array<Order> {
    let unsync_orders: Array<Order> = new Array<Order>();

    let peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return []; //yes empty since it is not even paired to any account

    var orders = traderAccount.Orders();

    var pairId = traderAccount.PairID();

    var open_bit_order_pairs: PairBitOrder[] = this.syncOpenBitOrderPairs.get(
      pairId
    );
    var closed_bit_order_pairs: PairBitOrder[] = this.syncClosedBitOrderPairs.get(
      pairId
    );

    if (!open_bit_order_pairs) return orders; //meaning no order has been synced so return all

    if (!closed_bit_order_pairs) {
      closed_bit_order_pairs = new Array<PairBitOrder>();
    }

    //at this point they are paired so get the actuall unsynced orders

    for (let order of orders) {
      var order_ticket = order.ticket;
      var found = false;

      //check in open paired tickets
      for (let ticket_pair of open_bit_order_pairs) {
        let own_bit_order: BitOrder = ticket_pair[traderAccount.PairColumnIndex()];//modified111
        if (own_bit_order.ticket === order_ticket) {//modified111
          found = true;
          break;
        }
      }

      //also check in closed paired tickets
      for (let ticket_pair of closed_bit_order_pairs) {
        let own_bit_order: BitOrder = ticket_pair[traderAccount.PairColumnIndex()];//modified111
        if (own_bit_order.ticket === order_ticket) {//modified111
          found = true;
          console.log(`found int closed tickets ${order_ticket}`);
          break;
        }
      }

      if (!found) {
        unsync_orders.push(order);
      }
    }

    return unsync_orders;
  }

  /**
   * These are orders that have been paired with its peer
   */
  private GetSyncedOrders(traderAccount: TraderAccount): Array<PairOrder> {
    var synced_orders: Array<PairOrder> = new Array<PairOrder>();
    var peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return synced_orders;

    var pairId = traderAccount.PairID();

    if (!this.syncOpenBitOrderPairs.get(pairId)) return synced_orders;

    var syncTickects: PairBitOrder[] = this.syncOpenBitOrderPairs.get(pairId);

    var order_pairs_not_found: Array<PairBitOrder> = new Array<PairBitOrder>();

    var row = -1;
    for (let ticket_pair of syncTickects) {
      row++;
      let own_column: number = traderAccount.PairColumnIndex();
      let peer_column: number = peerAccount.PairColumnIndex();
      let own_bit_order: BitOrder = ticket_pair[own_column];//modified111
      let peer_bit_order: BitOrder = ticket_pair[peer_column];//modified111

      let own_order: Order = traderAccount.GetOrder(own_bit_order.ticket);//modified111
      let peer_order: Order = peerAccount.GetOrder(peer_bit_order.ticket);//modified111

      if (!own_order || !peer_order) {
        //for case where the order does not exist
        order_pairs_not_found.push(ticket_pair);
        continue;
      }

      let paired: PairOrder = [null, null];
      paired[own_column] = own_order;
      paired[peer_column] = peer_order;

      synced_orders.push(paired);
    }

    //purge out orders not found
    for (let ticket_pair of order_pairs_not_found) {
      SyncUtil.ArrayRemove(this.syncOpenBitOrderPairs.get(pairId), ticket_pair);
    }

    return synced_orders;
  }

  GetPairedOwnTicketUsingPeerTicket(
    traderAccount: TraderAccount,
    peer_ticket: number
  ): number {
    var synced_orders: Array<PairOrder> = new Array<PairOrder>();
    var peerAccount = this.getPeer(traderAccount);

    if (peerAccount == null) return null;

    var pairId = traderAccount.PairID();

    if (!this.syncOpenBitOrderPairs.get(pairId)) return null;

    var syncBitOrders: PairBitOrder[] = this.syncOpenBitOrderPairs.get(pairId);

    for (let pair_bit_order of syncBitOrders) {
      let own_column: number = traderAccount.PairColumnIndex();
      let peer_column: number = peerAccount.PairColumnIndex();
      if (pair_bit_order[peer_column].ticket == peer_ticket) {//modified111
        return pair_bit_order[own_column].ticket;//modified111
      }
    }

    return null;
  }

  private SaveSyncState() {
    var data = JSON.stringify(Array.from(this.syncOpenBitOrderPairs.entries()));

    //overwrite the file content
    fs.writeFile(
      Config.SYNC_LOG_FILE,
      data,
      { encoding: "utf8", flag: "w" },
      function (err) {
        if (err) {
          return console.log(err);
        }
      }
    );
  }

  public RefreshAccountInfo(): void {
    this.eachPairedAccount((account: TraderAccount) => {
      ipcSend("account-info", account.Safecopy());
    });
  }

  public RevalidateSyncAll(): void {
    console.log("Revalidating all sync begins...");

    this.eachPairedAccount((account: TraderAccount) => {
      if (!account.IsMarketClosed()) {
        this.RevalidateSyncCopy(account);
        this.RevalidateSyncClose(account);
        this.RevalidateSyncModify(account);
      }
    });

    /*
        //TESTING!!! TO BE REMOVE
        if (this.pairedAccounts[0] && this.pairedAccounts[0][0].Orders()[0]) {//TESTING!!! TO BE REMOVE
            this.pairedAccounts[0][0].Orders()[0].SyncCopying(true);
            ipcSend('sending-sync-copy', {
                account: this.pairedAccounts[0][0].Safecopy(),
                order: this.pairedAccounts[0][0].Orders()[0]
            });
        }*/
  }

  private RevalidateSyncCopy(account: TraderAccount): void {
    console.log("Revalidating copy sync...");

    this.SendCopyToPeer(account);
  }

  private RevalidateSyncClose(account: TraderAccount): void {
    console.log("Revalidating close sync...");

    this.SendCloseToPeer(account);
  }

  private RevalidateSyncModify(account: TraderAccount): void {
    console.log("Revalidating modify sync...");

    this.SendModifyToPeer(account);
  }

  private HandleRead(account: TraderAccount, data: string) {
    if (data == null || data.length == 0) return;

    if (data != "ping=pong") {
      //console.log(`[${account.StrID()}] `, data); //TESTING!!!
    }

    let intro: boolean = false;
    let is_stoploss_changed: boolean = false;
    let peer_broker: string = null;
    let peer_account_number: string = null;
    let ticket: number = null;
    let origin_ticket: number = null;
    let is_copy_trades: boolean = false;
    let is_close_trades: boolean = false;
    let is_modify_trades: boolean = false;
    let is_account_balance_changed: boolean = false;
    let place_order_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
    let copy_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
    let own_close_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
    let close_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
    let modify_target_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
    let modify_stoploss_success: StringBoolNull = null; // yes must be null since we care about three state: null, true or false
    let lock_in_profit_success = null; // yes must be null since we care about three state: null, true or false
    let maximize_lock_in_profit_success = null; // yes must be null since we care about three state: null, true or false
    let error: string = "";
    let uuid: string = "";
    let force: boolean = false;
    let reason: string = "";
    var token = data.split(Constants.TAB);
    let new_target: number = 0;
    let new_stoploss: number = 0;
    let trailing_stop: number = 0;
    let fire_market_closed = false;
    let fire_market_opened = false;
    let spread_cost: number = 0;
    let required_margin: number = 0;
    let symbol = "";
    let raw_symbol = "";
    let command_id = "";
    let command = ""; // name of the command
    let command_response = "";
    let command_success = false;

    for (var i = 0; i < token.length; i++) {
      var split = token[i].split("=");
      var name = split[0];
      var value = split[1];

      if(name == "command"){
        command = value;

      }

      if(name == "command_id"){
        command_id = value;
      }

      if(name == "command_response"){
        command_response = value;
      }

      if(name == "command_success"){
        command_success = value === "true";
        account.EACommandList.get(command_id)?.callback({
          message: command_response,
          success: command_success
        });
        account.EACommandList.delete(command_id);
      }

      if(name == "ea_executable_file"){
        account.SetEAExecutableFile(value);
      }      

      if (name == "is_market_closed") {
        if (value == "true") {
          //check if the previous state was open
          if (!account.IsMarketClosed()) {
            fire_market_closed = true;
          }

          account.SetMarketClosed(true);
        } else {
          //check if the previous state was close
          if (account.IsMarketClosed()) {
            fire_market_opened = true;
          }

          account.SetMarketClosed(false);
        }
      }

      if (name == "ping") {
        return;
      }
      if (name == "intro" && value == "true") {
        intro = true;
      }

      if (name == "uuid") {
        uuid = value;
      }

      if (name == "version") {
        account.SetVersion(value);
      }

      if (name == "broker") {
        var normalize_broker: string = SyncUtil.NormalizeName(value);
        account.SetBroker(normalize_broker);
      }

      if (name == "terminal_path") {
        account.SetIconFile(
          `${value}${path.sep}${Config.TERMINAL_ICON_NAME}${Config.TERMINAL_ICON_TYPE}`
        );
      }

      if (name == "account_number") {
        account.SetAccountNumber(value);
      }

      if (name == "account_name") {
        account.SetAccountName(value);
      }

      if (name == "account_balance") {
        account.SetAccountBalance(parseFloat(value));
      }

      if (name == "account_equity") {
        account.SetAccountEquity(parseFloat(value));
      }

      if (name == "account_credit") {
        account.SetAccountCredit(parseFloat(value));
      }

      if (name == "account_currency") {
        account.SetAccountCurrency(value);
      }

      if (name == "account_leverage") {
        account.SetAccountLeverage(parseFloat(value));
      }

      if (name == "account_margin") {
        account.SetAccountMargin(parseFloat(value));
      }

      if (name == "account_stopout_level") {
        account.SetAccountStopoutLevel(parseFloat(value));
      }

      if (name == "account_profit") {
        account.SetAccountProfit(parseFloat(value));
      }

      if (name == "account_free_margin") {
        account.SetAccountFreeMargin(parseFloat(value));
      }

      if (name == "account_swap_per_day") {
        account.SetAccountSwapPerDay(parseFloat(value));
      }

      if (name == "terminal_connected") {
        account.SetTerminalConnected(value === "true");
      }

      
      if (name == "only_trade_with_credit") {
        account.SetOnlyTradeWithCredit(value === "true");
      }
      
      if (name == "chart_symbol") {
        account.SetChartSymbol(value);
      }
      
      if (name == "chart_symbol_trade_allowed") {
        account.SetChartSymbolTradeAllowed(value === "true");
      }

      if (name == "chart_symbol_max_lot_size") {
        account.SetChartSymbolMaxLotSize(parseFloat(value));
      }

      if (name == "chart_symbol_min_lot_size") {
        account.SetChartSymbolMinLotSize(parseFloat(value));
      }

      if (name == "chart_symbol_tick_value") {
        account.SetChartSymbolTickValue(parseFloat(value));
      }

      if (name == "chart_symbol_swap_long") {
        account.SetChartSymbolSwapLong(parseFloat(value));
      }

      if (name == "chart_symbol_swap_short") {
        account.SetChartSymbolSwapShort(parseFloat(value));
      }
      
      if (name == "chart_symbol_trade_units") {
        account.SetChartSymbolTradeUnits(parseFloat(value));
      }

      if (name == "chart_symbol_spread") {
        account.SetChartSymbolSpread(parseFloat(value));
      }

      if (name == "chart_market_price") {
        account.SetChartMarketPrice(parseFloat(value));
      }

      if (name == "platform_type") {
        account.SetPlatformType(value);
      }

      if (name == "peer_broker") {
        peer_broker = SyncUtil.NormalizeName(value);
      }

      if (name == "peer_account_number") {
        peer_account_number = value;
      }

      if (name == "trade_copy_type") {
        account.SetTradeCopyType(value);
      }

      if (name == "is_live_account" && value == "true") {
        account.SetIsLiveAccount(true);
      } else if (name == "is_live_account" && value == "false") {
        account.SetIsLiveAccount(false);
      }

      if (name == "ticket") {
        var intValue = parseInt(value);
        if (intValue > -1) {
          ticket = intValue;
          var bitOrder: BitOrder ={ //modified111
            ticket : ticket,
            group_id : '',
            group_order_count: 0
          }
          account.SetOrder(bitOrder);//modified111
          account.EnsureTicketPeer(this.syncOpenBitOrderPairs);
          account.EnsureTicketPeer(this.syncClosedBitOrderPairs);
        }
      }

      if (name == "force") {
        force = value == "true";
        var order: Order = account.GetOrder(ticket);
        order.force = force;
      }

      if (name == "reason") {
        reason = value;
        var order: Order = account.GetOrder(ticket);
        order.reason = reason;
      }

      if (name == "origin_ticket") {
        origin_ticket = parseInt(value);
      }

      if (name == "symbol") {
        symbol = value; //important - used in this loop
        account.GetOrder(ticket).symbol = value;
      }


      if (name == "symbol_commission_per_lot") {        
        account.SetSymbolCommissionPerLot(symbol, parseFloat(value));
        account.SetSymbolCommissionPerLot(raw_symbol, parseFloat(value));
      }
      
      if (name == "raw_symbol") {
        raw_symbol = value; //important - used in this loop
        account.GetOrder(ticket).raw_symbol = value;
      }

      if (name == "position") {
        account.GetOrder(ticket).position = value;
      }

      if (name == "default_spread") {
        account.GetOrder(ticket).SetDefaultSpread(Number.parseFloat(value));
      }

      if (name == "point") {
        account.GetOrder(ticket).point = Number.parseFloat(value);
      }

      if (name == "open_price") {
        account.GetOrder(ticket).open_price = Number.parseFloat(value);
      }

      if (name == "close_price") {
        account.GetOrder(ticket).close_price = Number.parseFloat(value);
      }

      if (name == "lot_size") {
        account.GetOrder(ticket).lot_size = Number.parseFloat(value);
      }

      if (name == "target") {
        account.GetOrder(ticket).target = Number.parseFloat(value);
      }

      if (name == "stoploss") {
        account.GetOrder(ticket).stoploss = Number.parseFloat(value);
      }

      if (name == "close_time") {
        var order: Order = account.GetOrder(ticket);
        var was_close = order.close_time > 0;
        order.close_time = Number.parseInt(value);
        if (!was_close && order.close_time > 0) {
          //just closed
          account.SendCloseToGroup(ticket); // also close all orders in same group

          this.emailer.OrderCloseNotify(account, order);
        }
      }

      if (name == "open_time") {
        var order: Order = account.GetOrder(ticket);
        var was_open = order.open_time > 0;
        order.open_time = Number.parseInt(value);
        if (!was_open && order.open_time > 0) {
          //just opened
          this.emailer.OrderOpenNotify(account, order);
        }
      }

      if (name == "stoploss_change_time") {
        account.GetOrder(ticket).stoploss_change_time = Number.parseInt(value);
      }

      if (name == "target_change_time") {
        account.GetOrder(ticket).target_change_time = Number.parseInt(value);
      }

      if (name == "copy_signal_time") {
        account.GetOrder(ticket).copy_signal_time = Number.parseInt(value);
      }

      if (name == "close_signal_time") {
        account.GetOrder(ticket).close_signal_time = Number.parseInt(value);
      }

      if (name == "modify_target_signal_time") {
        account.GetOrder(ticket).modify_target_signal_time = Number.parseInt(
          value
        );
      }

      if (name == "modify_stoploss_signal_time") {
        account.GetOrder(ticket).modify_stoploss_signal_time = Number.parseInt(
          value
        );
      }

      if (name == "copy_execution_time") {
        account.GetOrder(ticket).copy_execution_time = Number.parseInt(value);
      }

      if (name == "close_execution_time") {
        account.GetOrder(ticket).close_execution_time = Number.parseInt(value);
      }

      if (name == "modify_target_execution_time") {
        account.GetOrder(ticket).modify_target_execution_time = Number.parseInt(
          value
        );
      }

      if (name == "modify_stoploss_execution_time") {
        account.GetOrder(
          ticket
        ).modify_stoploss_execution_time = Number.parseInt(value);
      }

      if (name == "new_target") {
        new_target = Number.parseFloat(value);
      }

      if (name == "new_stoploss") {
        new_stoploss = Number.parseFloat(value);
      }
      
      if (name == "lock_in_profit_success") {
        lock_in_profit_success = value;
        if(ticket > -1){
          account.GetOrder(ticket).is_lock_in_profit = value == "true";
          trailing_stop = account.GetOrder(ticket).stoploss
        }        
      }
      
      if (name == "maximize_lock_in_profit_success") {
        maximize_lock_in_profit_success = value;
        if(ticket > -1){
          trailing_stop = account.GetOrder(ticket).stoploss
        }
      }
      

      if (name == "stoploss_changed" && value == "true") {
        is_stoploss_changed = true;
      }

      if (name == "modify_target_success") {
        modify_target_success = value;
      }

      if (name == "modify_stoploss_success") {
        modify_stoploss_success = value;
      }

      if (name == "place_order_success") {
        place_order_success = value;
      }

      if (name == "copy_success") {
        copy_success = value;
      }

      if (name == "close_success") {
        close_success = value;
      }

      if (name == "own_close_success") {
        own_close_success = value;
      }

      if (name == "copy_trades" && value == "true") {
        is_copy_trades = true;
      }

      if (name == "close_trades" && value == "true") {
        is_close_trades = true;
      }

      if (name == "modify_trades" && value == "true") {
        is_modify_trades = true;
      }

      if (name == "account_balance_changed" && value == "true") {
        is_account_balance_changed = true;
      }

      if (name == "spread_cost") {
        spread_cost = parseFloat(value);
      }

      if (name == "required_margin") {
        required_margin = parseFloat(value);
      }

      
      if (name == "account_expected_hedge_profit") {
        account.SetHedgeProfit(parseFloat(value));
      }
    
      
      if (name == "account_trade_cost") {
        account.SetAccountTradeCost(parseFloat(value));
      }    
      
      if (name == "account_swap_cost") {
        account.SetAccountSwapCost(parseFloat(value));
      }
    
      if (name == "account_commission_cost") {
        account.SetAccountCommissionCost(parseFloat(value));
      }
    
      if (name == "error") {
        error = value;
        account.SetLastError(error);
      }
    }

    if (intro) {
      if (account.Broker() && account.AccountNumber()) {
        if(this.checkDuplicateEA(account)){
          account.SetLastError(Constants.ERR_DUPLICATE_EA);
          account.sendEACommand(Constants.CMD_DUPLICATE_EA);
        }else{
          ipcSend("intro", account.Safecopy());
        }        
      } else {
        account.SendGetIntro();
      }
    }

    if (ticket > -1) {
      ipcSend("order", account.Safecopy());
    }

    var peer = this.getTraderAccount(peer_broker, peer_account_number);
    this.PairTraderAccountWith(account, peer);    

    if (fire_market_closed) {
      ipcSend("market-close", account.Safecopy());
    }

    if (fire_market_opened) {
      ipcSend("market-open", account.Safecopy());
    }

    if (is_copy_trades) {
      this.SendCopyToPeer(account);
    }

    if (is_close_trades) {    
      this.SendCloseToPeer(account);
    }

    if (is_modify_trades || is_stoploss_changed) {
      this.SendModifyToPeer(account);
    }

    if (is_account_balance_changed) {
      ipcSend("account-balance-changed", account.Safecopy());
    }


    if (place_order_success == "true") {
      var result = this.OnPlaceOrderResult(account, ticket, uuid, true);
      ipcSend("sync-place-order-success", account.Safecopy());
      if (result == 2) {
        ipcSend("place-order-paired", account.Safecopy());
      }
    }

    if (place_order_success == "false") {
      this.OnPlaceOrderResult(account, ticket, uuid, false);
      ipcSend("sync-place-order-fail", account.Safecopy());
    }

    if (copy_success == "true") {
      this.OnCopyResult(account, ticket, origin_ticket, true);
      ipcSend("sync-copy-success", account.Safecopy());
    }

    if (copy_success == "false") {
      if (ticket == -1) {
        //we expect ticket to be -1 since the copy failed
        ticket = this.GetPairedOwnTicketUsingPeerTicket(account, origin_ticket); //get own ticket using peer ticket
      }
      this.OnCopyResult(account, ticket, origin_ticket, false);
      ipcSend("sync-copy-fail", account.Safecopy());
    }

    if (own_close_success == "true") {
      this.OnOwnCloseResult(account, ticket, true);
      ipcSend("own-close-success", {
        account: account.Safecopy(),
        force: force,
        reason: reason,
      });
    }

    if (own_close_success == "false") {
      this.OnOwnCloseResult(account, ticket, false);
      ipcSend("own-close-fail", {
        account: account.Safecopy(),
        force: force,
        ticket: ticket,
      });
    }

    if (close_success == "true") {
      this.OnCloseResult(account, ticket, origin_ticket, true);
      ipcSend("sync-close-success", account.Safecopy());
    }

    if (close_success == "false") {
      this.OnCloseResult(account, ticket, origin_ticket, false);
      ipcSend("sync-close-fail", account.Safecopy());
    }

    if (modify_target_success == "true") {
      this.OnModifyTargetResult(
        account,
        ticket,
        origin_ticket,
        new_target,
        true,
        error
      );
      ipcSend("modify-target-success", account.Safecopy());
    }

    if (modify_target_success == "false") {
      this.OnModifyTargetResult(
        account,
        ticket,
        origin_ticket,
        new_target,
        false,
        error
      );
      ipcSend("modify-target-fail", account.Safecopy());
    }

    if (modify_stoploss_success == "true") {
      this.OnModifyStoplossResult(
        account,
        ticket,
        origin_ticket,
        new_stoploss,
        true,
        error
      );
      ipcSend("modify-stoploss-success", account.Safecopy());
    }

    if (modify_stoploss_success == "false") {
      this.OnModifyStoplossResult(
        account,
        ticket,
        origin_ticket,
        new_stoploss,
        false,
        error
      );
      ipcSend("modify-stoploss-fail", account.Safecopy());
    }

    if(lock_in_profit_success == "true"){
      ipcSend("lock-in-profit-success", {
        account: account.Safecopy(),
        trailing_stop : trailing_stop
      }); 
    }
    
    if(lock_in_profit_success == "false"){
      ipcSend("lock-in-profit-fail", account.Safecopy()); 
    }

    if(maximize_lock_in_profit_success == "true"){
      ipcSend("maximize-lock-in-profit-success", {
        account: account.Safecopy(),
        trailing_stop : trailing_stop
      }); 
    }
    
    if(maximize_lock_in_profit_success == "false"){
      ipcSend("maximize-lock-in-profit-fail", account.Safecopy()); 
    }

    
    
  }

  private CheckPossibleLossPrevention(account: TraderAccount) {
    var before_swap_time = SyncUtil.AppConfigMap.get(
      "automatically_avoid_loss_due_to_next_day_swap_by_closing_trades_before_swap_time"
    ); // in milliseconds already

    if (!before_swap_time || before_swap_time <= 0) {
      return; //not set - so leave
    }


    var GMT = 2; //We are using GMT+2

    var swap_time = new Date().setUTCHours(24 + GMT); //the time swap is charged tomorrow

    var diff_time = swap_time - Date.now();

    if (diff_time > before_swap_time) {
      return;
    }

    //at this point the trades must be closed to avoid loss

    account.CloseAllTrades(
      "closing-all-trades",
      "Closing all tradings to avoid hedge loss due to swap increase."
    ); //close both own trades and peer trades
  }
}
