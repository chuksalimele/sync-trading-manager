const fs = require('fs');
var path = require('path');
const readline = require('readline');
const {google} = require('googleapis');

import { clouderrorreporting } from "googleapis/build/src/apis/clouderrorreporting";
import { Config } from "./Config";
import guiMsgBox, { GetSyncService, ipcSend } from "./main";
import { SyncUtil } from "./SyncUtil";
import { TraderAccount } from "./TraderAccount";

export class InstallController {

  // If modifying these scopes, delete token.json.
  private static SCOPES = ['https://www.googleapis.com/auth/drive.readonly',
                      'https://www.googleapis.com/auth/drive.metadata.readonly'];

  // The file token.json stores the user's access and refresh tokens, and is
  // created automatically when the authorization flow completes for the first
  // time.
  private static TOKEN_PATH = __dirname+path.sep+'token.json';
  
  private static CREDENTIALS_PATH = __dirname+path.sep+'credentials.json';

  private static auth: any = null;

  private static credentials: any = null;

  private static FileIdEX4: any = '1SF-Grb36-R8ersh4_dCzu8AvqkJAk7qg';// see it in the link https://drive.google.com/file/d/1SF-Grb36-R8ersh4_dCzu8AvqkJAk7qg/view?usp=sharing

  private static FileIdEX5: any = '18tDM90Wc401PrEQAiqXJ_SaOjwlCVMEB';// see it in the link https://drive.google.com/file/d/18tDM90Wc401PrEQAiqXJ_SaOjwlCVMEB/view?usp=sharing

  private static FileIdStmEXE: any = '1tGljjwzTBqnzTkr3bmYniXaltcSDOhQp';// see it in the link https://drive.google.com/file/d/1tGljjwzTBqnzTkr3bmYniXaltcSDOhQp/view?usp=sharing  

  private static MAX_REMOTE_REQUEST_PER_MINUTE = 2;

  private static MAX_REMOTE_REQUEST_PER_HOUR = 10;

  private static IsAuthorizing: boolean = false;

  private static AuthorizationFiled : boolean = false;

  private static installUpdateMetadataJson : any = {};

  private static IsNotifyingUserOfUpdate:boolean  = false;

  private static IsEAInstalling : boolean = false;

  private static IsEADowndoningInstalling : boolean = false;

  private static IsReinstallingAll : boolean = false;

  private static NextUpdateCheckTime : number = 0;

  constructor() {

  }

  private static Testing(){

    //------TEST Metedata Start---

    var metadata_arr = [{
      id: '1SF-Grb36-R8ersh4_dCzu8AvqkJAk7qg',
      name: 'SyncTradeClient.ex4',
      modifiedTime: '2022-02-10T20:54:48.031Z',
    },{
      id: '18tDM90Wc401PrEQAiqXJ_SaOjwlCVMEB',
      name: 'SyncTradeClient5.ex5',
      modifiedTime: '2022-02-10T20:54:48.031Z',
    },{
      id: '1tGljjwzTBqnzTkr3bmYniXaltcSDOhQp',
      name: 'stm-setup.exe',
      modifiedTime: '2022-02-10T20:54:48.031Z',
    }];
    //------TEST Metadata End

    this.wrapUpInstallation(metadata_arr);
        
  }

  private static wrapUpInstallation(metadata_arr: Array<any>){

    var old_metadataJson =  {...this.installUpdateMetadataJson};
    for(var metadata of metadata_arr){
      this.installUpdateMetadataJson[metadata.id].fileName = metadata.name;
      this.installUpdateMetadataJson[metadata.id].modifiedTime = metadata.modifiedTime;
      this.installUpdateMetadataJson[metadata.id].uptodate = true;
    }
    this.SaveFileMetadata(()=>{
      const exec = require('child_process').execFile;
      exec(Config.TEMP_STM_EXE_DEST, [], (error, stdout, stderr) => {
        if (error) {
          this.installUpdateMetadataJson = old_metadataJson;
          this.SaveFileMetadata(()=>{
            GetSyncService().Shutdown();    
            process.exit(0);
          });
          console.log(error);
          return;
        }
        GetSyncService().Shutdown();
        process.exit(0);
      });
    });
    
  }

  public static Init(){
    this.installUpdateMetadataJson = {}
    this.installUpdateMetadataJson[this.FileIdEX4] = {}
    this.installUpdateMetadataJson[this.FileIdEX5] = {}
    this.installUpdateMetadataJson[this.FileIdStmEXE] = {}

    fs.closeSync(fs.openSync(Config.TEMP_DOWNLOAD_DEST_EX4, 'w'));
    fs.closeSync(fs.openSync(Config.TEMP_DOWNLOAD_DEST_EX5, 'w'));
    try {

      var fd = null;
      
      if (fs.existsSync(Config.INSTALL_UPDATE_METADATA)) {
        //file exists

        //according to doc - Open file for reading and writing.
        //An exception occurs if the file does not exist
        //So since we know that at this point the file exists we are not bothered about exception
        //since it will definitely not be thrown

        fd = fs.openSync(Config.INSTALL_UPDATE_METADATA, "r+");
      } else {
        //file does not exist

        //according to doc - Open file for reading and writing.
        //The file is created(if it does not exist) or truncated(if it exists).
        //So since we known that at this point it does not we are not bothered about the truncation

        fd = fs.openSync(Config.INSTALL_UPDATE_METADATA, "w+");
      }


      var metadataJson = fs.readFileSync(fd);
      if(metadataJson.length > 0){
        this.installUpdateMetadataJson = JSON.parse(metadataJson);
      }
      
    } catch (e) {
      console.log(e);
      throw e;
    }

    this.RunUpdateCheck();


    /*setTimeout(()=>{
      InstallController.Testing();
    }, 20000);*/

    /*setTimeout(()=>{
      guiMsgBox.alert({
        title: 'WORKING DIREDTORY',
        message: __dirname
      });
    }, 20000);*/


  }

  private static RunUpdateCheck(){

    var hour = 60 * 60 * 1000;//UNCOMMENT LATER
    //var hour = 5 * 1000; //TESTING!!! COMMENT LATER
    
    var min: number = hour;
    var max: number = 3 * hour;

    this.NextUpdateCheckTime = Math.random() * (max - min) + min

    setTimeout(()=>{
      this.UpdateCheckTask();
      this.RunUpdateCheck();
    }, this.NextUpdateCheckTime);

  }

  private static RateLimitExceeded(): boolean{
   
    return false;//TODO
  }

  private static UpdateCheckTask(){
   

    if(this.IsReinstallingAll){
      return;
    }

    if(!this.installUpdateMetadataJson[this.FileIdEX4].uptodate
      ||!this.installUpdateMetadataJson[this.FileIdEX5].uptodate
      ||!this.installUpdateMetadataJson[this.FileIdStmEXE].uptodate){
        return this.NotifyUserOfNewUpdate();
    }

    var doUpdateCheck = ()=>{
        const drive = google.drive({version: 'v3', auth: this.auth});

        drive.files.list({
          pageSize: 10,
          fields: 'nextPageToken, files(id, name, modifiedTime)',
        }, (err, res) => {
          if (err) return console.log('The API returned an error: ' + err);
          const files = res.data.files;
          if (files.length) {
            
            files.map((file) => {
              if(!(file.id in this.installUpdateMetadataJson)){
                return;
              }

              if(file.modifiedTime != this.installUpdateMetadataJson[file.id].modifiedTime){
                this.installUpdateMetadataJson[file.id].uptodate = false;            
              }

              console.log(`${file.name} (${file.id})`);

            });

            this.SaveFileMetadata();
            this.NotifyUserOfNewUpdate();

          } else {
            console.log('No files found.');
          }
        });
    }

    var authError = {
      OnComplete : (response)=>{
        if(response.error){
          console.log(response.error);
        }        
      }
    }
    
    this.AuthorizationFiled = false;

    //start authorization only if none in current going on - avoid simultaneous authorization         
    SyncUtil.WaitAsyncWhile(
        this.Authorize.bind(this, doUpdateCheck, authError),
        () => this.IsAuthorizing , // keep wait while authorization is in progress by another
        () => this.AuthorizationFiled //stop waiting and exit immediately if Authorization failed - Do not bother to start call the Authorize method
    );
    
  }

  private static NotifyUserOfNewUpdate(){

    if(this.installUpdateMetadataJson[this.FileIdEX4].uptodate
      &&this.installUpdateMetadataJson[this.FileIdEX5].uptodate
      &&this.installUpdateMetadataJson[this.FileIdStmEXE].uptodate){
        return;
      }

      if(this.IsNotifyingUserOfUpdate){
        return;
      }

      var onConfirmBoxClose = (immediate)=>{
        
        this.IsNotifyingUserOfUpdate   = false;

        if(!this.installUpdateMetadataJson[this.FileIdStmEXE].uptodate){
          
            this.ReInstallAll();
            
        }else if(!this.installUpdateMetadataJson[this.FileIdEX4].uptodate
              || !this.installUpdateMetadataJson[this.FileIdEX5].uptodate){
            
            this.InstallEAUpdate(immediate);

        }
      }

      this.IsNotifyingUserOfUpdate   = true;
      //At this point the is a new update available
      guiMsgBox.notify({
        message:'New update available for installation...',
        type:'stm-notify',
        duration: 0, // keep open till clicked
        close:()=>{
            guiMsgBox.confirm({
              title:'Update Available',
              message:"Do you want to install the new update?",
              yes:()=>{                
                guiMsgBox.confirm({
                  title:'Confirm',
                  message: '<p>Do you want the EA to stop immediately in order to reload with the new installation?</p>'
                  +'<p>If you click \'Yes\' the EA will stop immediately after installation so you can reload it to use the new installation.</p>'
                  +'<p>If you click \'No\' the EA will keep running using the previous installation untill it gets discconnected from service.</p>',
                  yes:()=>{
                    onConfirmBoxClose(true);
                  },
                  no:()=>{
                    onConfirmBoxClose(false);
                  }
                })
              },
              no:()=>{
                this.IsNotifyingUserOfUpdate   = false;
              },
            })
        }
      })

  }

  public static InstallWith(file_name:string, immediate: boolean){      
      
      if(this.IsEAInstalling){
        return;
      }

      this.IsEAInstalling = true;  
      
      var accounts :Array<TraderAccount> = []

      if(file_name.endsWith('.ex4')){
          accounts = GetSyncService().getMT4Accounts();             
      }else if(file_name.endsWith('.ex5')){
          accounts = GetSyncService().getMT5Accounts();             
      }else{
          guiMsgBox.alert({
              title:'Invalid',
              message:'Invalid file type! Expected an ex4 or ex5 file'
          })
          this.IsEAInstalling = false;
          return 
      }

      var installFn = (err, ea_paths)=>{
           
            if(err){            
                guiMsgBox.alert({
                  title:'Error',
                  message:err
                })
                this.IsEAInstalling = false;
                return;
            }

             this.InstallWith0(ea_paths, file_name, immediate, accounts);        
        }

        if(file_name.endsWith('.ex4')){
            SyncUtil.GetEAPathsMQL4(Config.MT_ALL_TERMINALS_DATA_ROOT, installFn); 
        }else if(file_name.endsWith('.ex5')){
            SyncUtil.GetEAPathsMQL5(Config.MT_ALL_TERMINALS_DATA_ROOT, installFn); 
        }

  }

  private static InstallWith0(
      destination_files: Array<string>,
      file_name:string,
      immediate: boolean,
      accounts: Array<TraderAccount>){      
      
      var dest_files = Array.isArray(destination_files) ? destination_files : [destination_files];

      if(dest_files.length === 0){
        return;
      }      

      var completion : TaskCompletion= {
        OnComplete:(response: any)=>{
                
            this.IsEAInstalling = false;
                
            if(response.success){
                guiMsgBox.alert({
                    title: 'Success',
                    message: response.success
                })
            }
            if(response.cancel){
                 guiMsgBox.alert({
                     title: 'Cancelled',
                    message: response.cancel
                })
            }
            if(response.error){
                guiMsgBox.alert({
                     title: 'Error',
                    message: response.error
                })
            }
                
            for(var account of accounts){
                account.sendEACommand('reload_ea_modified', {immediate : immediate});
            }       
        }
      }

      this.copyFileMultiple(file_name, dest_files, null ,completion);      
  }

  public static InstallEAUpdate(immediate: boolean){
    
        if(this.IsEADowndoningInstalling){
          return;
        }  

        this.IsEADowndoningInstalling = true;
        
        SyncUtil.GetEAPaths(Config.MT_ALL_TERMINALS_DATA_ROOT, (err, ea_paths)=>{
           
          if(err){
              guiMsgBox.alert({
                  title:'Error',
                  message:err
              })
              this.IsEADowndoningInstalling = false;
              return;
          }

          this.InstallEAUpdate0(ea_paths, immediate);          
      })  
                 
  }
  
  private static InstallEAUpdate0(
    destination_files: Array<string>,
    immediate: boolean){

      var dest_files = Array.isArray(destination_files,) ? destination_files : [destination_files];

      var dest_files_mt4 = dest_files.filter(file=> file.endsWith('.ex4'));
      var dest_files_mt5 = dest_files.filter(file=> file.endsWith('.ex5'));
      
      if(dest_files_mt4.length === 0 && dest_files_mt5.length === 0){
        this.IsEADowndoningInstalling = false;
        return;
      }      

      if(this.installUpdateMetadataJson[this.FileIdEX4].uptodate
        && this.installUpdateMetadataJson[this.FileIdEX5].uptodate){
          guiMsgBox.alert({
            title: 'Success',
            message: "The EAs are uptodate!"
        }) 
        this.IsEADowndoningInstalling = false;
        return;
      }
  

      var doing = 0;
      var done = 0;
      var success ='';
      var metadata_arr = [];

      var completion: TaskCompletion = {
        OnComplete:(response:any)=>{
          if(response.success){
            success += response.success+'\n';
          }
          if(response.cancel || response.error){
            this.IsEADowndoningInstalling = false;  
            if(response.cancel){
              guiMsgBox.alert({
                  title: 'Cancelled',
                  message: response.cancel
              })
            }
            if(response.error){
                guiMsgBox.alert({
                    title: 'Error',
                    message: response.error
                })
            }
          }
          

          if(response.value){
            metadata_arr.push(response.value);
          }

          done++;
          if(doing != done){
            return;
          }
          
          //at this point it fully complete
          this.IsEADowndoningInstalling = false;
          
          if(response.success){
              guiMsgBox.alert({
                  title: 'Success',
                  message: success
              })
          }
          for(var metadata of metadata_arr){
            this.installUpdateMetadataJson[metadata.id].fileName = metadata.name;
            this.installUpdateMetadataJson[metadata.id].modifiedTime = metadata.modifiedTime;
            this.installUpdateMetadataJson[metadata.id].uptodate = true;
          }
          this.SaveFileMetadata(()=>{
            var accounts = GetSyncService().getAccounts();                
            for(var account of accounts){
                account.sendEACommand('reload_ea_modified', {immediate : immediate});
            }            
          });

       }
      }
      

      var progressObj = {}

      var downloadProgress = (file_name, progress_percent, size_downloaded, file_size)=>{
        //using this progress object we can calculate the actual progress percent on the client size
        progressObj[file_name] = {
          name : file_name,
          percent: progress_percent,
          amount: size_downloaded,
          size : file_size
        }
        //send the download progress to the GUI for display by progress bar
        ipcSend('reinstall-download-progress', progressObj);
      }

      if(!this.installUpdateMetadataJson[this.FileIdEX4].uptodate){
        doing++;
        this.Download(this.FileIdEX4, Config.TEMP_DOWNLOAD_DEST_EX4, dest_files_mt4, completion, downloadProgress);        
      }

      if(!this.installUpdateMetadataJson[this.FileIdEX5].uptodate){      
        doing++
        this.Download(this.FileIdEX5, Config.TEMP_DOWNLOAD_DEST_EX5,  dest_files_mt5, completion, downloadProgress);
      }
  }

  public static ReInstallAll(){
    
      if(this.IsReinstallingAll){
        return;
      }

      this.IsReinstallingAll = true;

      SyncUtil.GetEAPaths(Config.MT_ALL_TERMINALS_DATA_ROOT, (err, ea_paths)=>{
         
        if(err){
            guiMsgBox.alert({
                title:'Error',
                message:err
            })
            this.IsReinstallingAll = false;
            return;
        }

        this.ReInstallAll0(ea_paths);          
    })  
               
}

  private static ReInstallAll0(
    destination_files: Array<string>|string){
     
    var dest_files = Array.isArray(destination_files,) ? destination_files : [destination_files];

    var dest_files_mt4 = dest_files.filter(file=> file.endsWith('.ex4'));
    var dest_files_mt5 = dest_files.filter(file=> file.endsWith('.ex5'));
    
    if(dest_files_mt4.length === 0 && dest_files_mt5.length === 0){
      this.IsReinstallingAll = false;
      return;
    }      
  
    var doing = 0;
    var done = 0;

    var metadata_arr = [];

    var completion: TaskCompletion = {
          OnComplete:(response:any)=>{
          
          if(response.cancel || response.error){
              this.IsReinstallingAll = false;  
              if(response.cancel){
                guiMsgBox.alert({
                    title: 'Cancelled',
                    message: response.cancel
                })
              }
              if(response.error){
                  guiMsgBox.alert({
                      title: 'Error',
                      message: response.error
                  })
              }
          }


          if(response.value){
            metadata_arr.push(response.value);
          }

          done++;
          if(doing != done){
            return;
          }
          
          //at this point it fully complete
          
          this.IsReinstallingAll = false;

          if(response.success){
              //send special message and launch the stm-setup installer and close this app
              guiMsgBox.alert({
                  title: 'Success',
                  message: response.success,
                  close: ()=>{
                    this.wrapUpInstallation(metadata_arr);                
                  }
              })
          }
        
        }
    }


    var progressObj = {}
    
    var downloadProgress = (file_name, progress_percent, size_downloaded, file_size)=>{
        //using this progress object we can calculate the actual progress percent on the client size
        progressObj[file_name] = {
          name : file_name,
          percent: progress_percent,
          amount: size_downloaded,
          size : file_size
        }
        //send the download progress to the GUI for display by progress bar
        ipcSend('reinstall-download-progress', progressObj);
    }

    doing++;
    this.Download(this.FileIdEX4, Config.TEMP_DOWNLOAD_DEST_EX4, dest_files_mt4, completion, downloadProgress);
    
    doing++
    this.Download(this.FileIdEX5, Config.TEMP_DOWNLOAD_DEST_EX5, dest_files_mt5, completion, downloadProgress);
                  
    doing++
    this.Download(this.FileIdStmEXE, Config.TEMP_STM_EXE_DEST, Config.TEMP_STM_EXE_DEST, completion, downloadProgress);
}

  private static copyFileMultiple(source: string, dest_files: Array<string>, metadata:any, completion: TaskCompletion){

    var count_done = 0;
    var err_count = 0;
    var err_str = '';
    var success_str = '';
    var copyFunc = function (err, token) {
            
      var dest = this;

      count_done ++;
      
      if (err){
        err_count++;
        err_str += err + '\n';            
        console.log(err);  
      }else{        
        success_str += `Installed to :  ${dest}\n`;
      }


      if(count_done < dest_files.length){
          return;
      }
      
      //at this point it is complete
      
      if(err_count == 0){     
        completion.OnComplete({success: success_str , value: metadata}) 
      }else{            
        completion.OnComplete({error:`${err_count} error(s) occured\n${count_done-err_count} installed.\n\nError:\n\n${err_str}`})       
      }

    }

    for(var dest of dest_files){
      if(dest != source){
        fs.copyFile(source, dest, copyFunc.bind(dest));
      }else{
        //since the source is same as destination, no point to do any actual file copying
        copyFunc.bind(dest)();
      }
      
    }
  }

  /**
   * Create an OAuth2 client with the given credentials
   * @param {Object} credentials The authorization client credentials.
   */
  private static Authorize(action: Function, completion: TaskCompletion) {
      this.IsAuthorizing = true;
            
      if(this.credentials === null){
          // Load client secrets from a local file.
          fs.readFile(this.CREDENTIALS_PATH, (err, content) => {
              if (err){
                  completion.OnComplete({error:'Could not read athorization credentials'}) 
                  console.log('Error loading authorization credentails:', err);
                 return ;
              } 
              // Authorize a client with credentials.
              try{
                this.credentials = JSON.parse(content);
                this.AuthorizeAndRunTasks(action, completion);
              }catch(ex){
                completion.OnComplete({error:'Authorization credentials is corrupt.!'})
                console.error(ex);
              }
          });
      }else{
          this.AuthorizeAndRunTasks(action, completion);
      }
              
  }

  private static AuthorizeAndRunTasks(action: Function, completion: TaskCompletion){
      if(this.credentials == null){
          completion.OnComplete({error:"Credential cannot be null"});
          return;
      }

      const {client_secret, client_id, redirect_uris} = this.credentials.installed;
      const oAuth2Client = new google.auth.OAuth2(
          client_id, client_secret, redirect_uris[0]);

      // Check if we have previously stored a token.
      fs.readFile(this.TOKEN_PATH, (err, token) => {
          if (err) return this.GetAccessTokenForAuth(oAuth2Client, action, completion);
          try{
            oAuth2Client.setCredentials(JSON.parse(token));
            this.AfterAuthorizeAttempt(oAuth2Client, action);
          }catch(ex){
            completion.OnComplete({error:'Authorization credentials is corrupt.!'})
            console.error(ex);
          }
      });
  }

  
  private static AfterAuthorizeAttempt(oAuth2Client, action: Function){
    this.auth = oAuth2Client;
    this.IsAuthorizing = false;
    this.AuthorizationFiled = !oAuth2Client;

    if(this.auth){
      action.call(this);// jsut execute the action
    }    
  }

  private static promptAuthorizationHTML(authUrl: string):string{
    //electron.shell.openExternal('${authUrl}')
    var html = `<p>The app requires athorization:</p>
                <p>
                   <a href="#" style="font-style:bold;" onclick="electron.shell.openExternal('${authUrl}')">
                      CLICK HERE TO VISIT THE AUTHORIZATION PAGE
                   </a>
                </p>                
                <p>Enter the code from that page here</p>`

    return html;
  }

  private static SaveFileMetadata(callback: Function=null){
    
    fs.writeFile(Config.INSTALL_UPDATE_METADATA, JSON.stringify(this.installUpdateMetadataJson), (err) => {
      if (err) return console.error(err); 
      callback?.();     
    });

  }

  /**
   * Get and store new token after prompting for user authorization
   * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
   */
  private static GetAccessTokenForAuth(oAuth2Client, action: Function, completion: TaskCompletion) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES,
    });
    
    var msg = this.promptAuthorizationHTML(authUrl);
    
    guiMsgBox.prompt({
        title: 'Authorization Required',
        message:msg,
        input:(code) => {    
          oAuth2Client.getToken(code, (err, token) => {

            if (err) {              
              this.AfterAuthorizeAttempt(null, action);
              completion.OnComplete({error:'Could not retrieve access token!'});
              console.error('Error retrieving access token', err);
              return;
            }
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(this.TOKEN_PATH, JSON.stringify(token), (err) => {
              if (err) return console.error(err);
              console.log('Token stored to', this.TOKEN_PATH);
            });
            this.AfterAuthorizeAttempt(oAuth2Client, action);
          });
        },
        cancel:()=>{
          this.AfterAuthorizeAttempt(null, action);
          //TODO
          //do something since cancel is click. e.g send waring notification
          completion.OnComplete({cancel:'Cancelled by user'}); //
        }, 
    });
    
  }

  private static GetMetadata(drive, fileId, callbak: Function){

      drive.files.get({
        fileId: fileId, 
        fields: 'id, name, size, modifiedTime'
      },
          (err, res)=>{
              if (err){
                var err_str = '';
                  if(typeof err == 'object'){
                    err_str = 'The API returned an error: ' + err.message
                  }else{
                    err_str = 'The API returned an error: ' + err
                  }
                return callbak(err_str);
              };

              callbak(null, res.data);
              
          }
      );

  }

  /**
   * Download the files.
   * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
   */
  private static Download(fileId:string, tmp_dest: string, destinations:string|Array<string>, completion: TaskCompletion, progress: Function=null) {
          
          var main_destinations = Array.isArray(destinations)? destinations: [destinations]; 
          
          var action = ()=>{

            const drive = google.drive({version: 'v3', auth: this.auth});
            var progress_perecent = 0;
            var downloaded_size = 0; 
            var remote_file_size = 0;
            var remote_file_name = '';
            var tmp_dest_stream = fs.createWriteStream(tmp_dest);
         
            var streamData = (metadata)=>{

                      drive.files.get({fileId: fileId, alt: 'media'}, {responseType: 'stream'},
                      (err, res)=>{
                          if (err){
                              var err_str = '';
                              if(typeof err == 'object'){
                                if(typeof err.response == 'object'){
                                  err_str = 'The API returned an error: ' + (err.response.statusText ? err.response.statusText: err.response);
                                }else if(err.message){
                                  err_str = 'The API returned an error: ' + err.message;
                                }else{
                                  err_str = 'The API returned an error: ' + err;
                                }
                              }else{
                                err_str = 'The API returned an error: ' + err
                              }
                              
                              completion.OnComplete({error:err_str});

                              console.log(err_str)
                            return;
                          };
                
                          res.data
                          .on('end', () => {                                                      
                              //copy to the repective locations
                              this.copyFileMultiple(tmp_dest, main_destinations, metadata ,completion);                              
                          })
                          .on('data', (data) => {
                            downloaded_size += data.length;
                            progress_perecent = Math.ceil(downloaded_size / remote_file_size * 100);   
                                               
                            progress?.(remote_file_name, progress_perecent, downloaded_size, remote_file_size);
                          })
                          .on('error', err => {
                              completion.OnComplete({error:err});
                              console.log('Error', err);
                          })
                          .pipe(tmp_dest_stream);
                      }
                );
            }

            var clearBeforeStreamData = (metadata)=>{
                  fs.truncate(tmp_dest, (err)=>{
                    if(err){
                      completion.OnComplete({error:err});
                      console.log(err);
                      return;
                    }
                    streamData(metadata);
                  })
            }
   
            this.GetMetadata(drive, fileId, (err, data)=>{

                  if(err){
                    completion.OnComplete({error:err});
                    console.log(err);
                    return;
                  }

                  remote_file_name = data.name;
                  remote_file_size = data.size;
                  clearBeforeStreamData(data);
            });
          
        }
          
        this.AuthorizationFiled = false;

        //start authorization only if none in current going on - avoid simultaneous authorization         
        SyncUtil.WaitAsyncWhile(
            this.Authorize.bind(this, action, completion),
            () => this.IsAuthorizing , // keep wait while authorization is in progress by another
            () => this.AuthorizationFiled //stop waiting and exit immediately if Authorization failed - Do not bother to start call the Authorize method
        );
                        
  }

}