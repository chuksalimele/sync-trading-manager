"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstallController = void 0;
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis').google;
var Config_1 = require("./Config");
var main_1 = require("./main");
var SyncUtil_1 = require("./SyncUtil");
var InstallController = /** @class */ (function () {
    function InstallController() {
    }
    InstallController.Testing = function () {
        //------TEST Metedata Start---
        var metadata_arr = [{
                id: '1SF-Grb36-R8ersh4_dCzu8AvqkJAk7qg',
                name: 'SyncTradeClient.ex4',
                modifiedTime: '2022-02-10T20:54:48.031Z',
            }, {
                id: '18tDM90Wc401PrEQAiqXJ_SaOjwlCVMEB',
                name: 'SyncTradeClient5.ex5',
                modifiedTime: '2022-02-10T20:54:48.031Z',
            }, {
                id: '1tGljjwzTBqnzTkr3bmYniXaltcSDOhQp',
                name: 'stm-setup.exe',
                modifiedTime: '2022-02-10T20:54:48.031Z',
            }];
        //------TEST Metadata End
        this.wrapUpInstallation(metadata_arr);
    };
    InstallController.wrapUpInstallation = function (metadata_arr) {
        var _this = this;
        var old_metadataJson = __assign({}, this.installUpdateMetadataJson);
        for (var _i = 0, metadata_arr_1 = metadata_arr; _i < metadata_arr_1.length; _i++) {
            var metadata = metadata_arr_1[_i];
            this.installUpdateMetadataJson[metadata.id].fileName = metadata.name;
            this.installUpdateMetadataJson[metadata.id].modifiedTime = metadata.modifiedTime;
            this.installUpdateMetadataJson[metadata.id].uptodate = true;
        }
        this.SaveFileMetadata(function () {
            var exec = require('child_process').execFile;
            exec(Config_1.Config.TEMP_STM_EXE_DEST, [], function (error, stdout, stderr) {
                if (error) {
                    _this.installUpdateMetadataJson = old_metadataJson;
                    _this.SaveFileMetadata(function () {
                        main_1.GetSyncService().Shutdown();
                        process.exit(0);
                    });
                    console.log(error);
                    return;
                }
                main_1.GetSyncService().Shutdown();
                process.exit(0);
            });
        });
    };
    InstallController.Init = function () {
        this.installUpdateMetadataJson = {};
        this.installUpdateMetadataJson[this.FileIdEX4] = {};
        this.installUpdateMetadataJson[this.FileIdEX5] = {};
        this.installUpdateMetadataJson[this.FileIdStmEXE] = {};
        fs.closeSync(fs.openSync(Config_1.Config.TEMP_DOWNLOAD_DEST_EX4, 'w'));
        fs.closeSync(fs.openSync(Config_1.Config.TEMP_DOWNLOAD_DEST_EX5, 'w'));
        try {
            var fd = null;
            if (fs.existsSync(Config_1.Config.INSTALL_UPDATE_METADATA)) {
                //file exists
                //according to doc - Open file for reading and writing.
                //An exception occurs if the file does not exist
                //So since we know that at this point the file exists we are not bothered about exception
                //since it will definitely not be thrown
                fd = fs.openSync(Config_1.Config.INSTALL_UPDATE_METADATA, "r+");
            }
            else {
                //file does not exist
                //according to doc - Open file for reading and writing.
                //The file is created(if it does not exist) or truncated(if it exists).
                //So since we known that at this point it does not we are not bothered about the truncation
                fd = fs.openSync(Config_1.Config.INSTALL_UPDATE_METADATA, "w+");
            }
            var metadataJson = fs.readFileSync(fd);
            if (metadataJson.length > 0) {
                this.installUpdateMetadataJson = JSON.parse(metadataJson);
            }
        }
        catch (e) {
            console.log(e);
            throw e;
        }
        this.RunUpdateCheck();
        /*setTimeout(()=>{
          InstallController.Testing();
        }, 20000);*/
    };
    InstallController.RunUpdateCheck = function () {
        var _this = this;
        var hour = 60 * 60 * 1000; //UNCOMMENT LATER
        //var hour = 5 * 1000; //TESTING!!! COMMENT LATER
        var min = hour;
        var max = 3 * hour;
        this.NextUpdateCheckTime = Math.random() * (max - min) + min;
        setTimeout(function () {
            _this.UpdateCheckTask();
            _this.RunUpdateCheck();
        }, this.NextUpdateCheckTime);
    };
    InstallController.RateLimitExceeded = function () {
        return false; //TODO
    };
    InstallController.UpdateCheckTask = function () {
        var _this = this;
        if (this.IsReinstallingAll) {
            return;
        }
        if (!this.installUpdateMetadataJson[this.FileIdEX4].uptodate
            || !this.installUpdateMetadataJson[this.FileIdEX5].uptodate
            || !this.installUpdateMetadataJson[this.FileIdStmEXE].uptodate) {
            return this.NotifyUserOfNewUpdate();
        }
        var doUpdateCheck = function () {
            var drive = google.drive({ version: 'v3', auth: _this.auth });
            drive.files.list({
                pageSize: 10,
                fields: 'nextPageToken, files(id, name, modifiedTime)',
            }, function (err, res) {
                if (err)
                    return console.log('The API returned an error: ' + err);
                var files = res.data.files;
                if (files.length) {
                    files.map(function (file) {
                        if (!(file.id in _this.installUpdateMetadataJson)) {
                            return;
                        }
                        if (file.modifiedTime != _this.installUpdateMetadataJson[file.id].modifiedTime) {
                            _this.installUpdateMetadataJson[file.id].uptodate = false;
                        }
                        console.log(file.name + " (" + file.id + ")");
                    });
                    _this.SaveFileMetadata();
                    _this.NotifyUserOfNewUpdate();
                }
                else {
                    console.log('No files found.');
                }
            });
        };
        var authError = {
            OnComplete: function (response) {
                if (response.error) {
                    console.log(response.error);
                }
            }
        };
        this.AuthorizationFiled = false;
        //start authorization only if none in current going on - avoid simultaneous authorization         
        SyncUtil_1.SyncUtil.WaitAsyncWhile(this.Authorize.bind(this, doUpdateCheck, authError), function () { return _this.IsAuthorizing; }, // keep wait while authorization is in progress by another
        function () { return _this.AuthorizationFiled; } //stop waiting and exit immediately if Authorization failed - Do not bother to start call the Authorize method
        );
    };
    InstallController.NotifyUserOfNewUpdate = function () {
        var _this = this;
        if (this.installUpdateMetadataJson[this.FileIdEX4].uptodate
            && this.installUpdateMetadataJson[this.FileIdEX5].uptodate
            && this.installUpdateMetadataJson[this.FileIdStmEXE].uptodate) {
            return;
        }
        if (this.IsNotifyingUserOfUpdate) {
            return;
        }
        var onConfirmBoxClose = function (immediate) {
            _this.IsNotifyingUserOfUpdate = false;
            if (!_this.installUpdateMetadataJson[_this.FileIdStmEXE].uptodate) {
                _this.ReInstallAll();
            }
            else if (!_this.installUpdateMetadataJson[_this.FileIdEX4].uptodate
                || !_this.installUpdateMetadataJson[_this.FileIdEX5].uptodate) {
                _this.InstallEAUpdate(immediate);
            }
        };
        this.IsNotifyingUserOfUpdate = true;
        //At this point the is a new update available
        main_1.default.notify({
            message: 'New update available for installation...',
            type: 'stm-notify',
            duration: 0,
            close: function () {
                main_1.default.confirm({
                    title: 'Update Available',
                    message: "Do you want to install the new update?",
                    yes: function () {
                        main_1.default.confirm({
                            title: 'Confirm',
                            message: '<p>Do you want the EA to stop immediately in order to reload with the new installation?</p>'
                                + '<p>If you click \'Yes\' the EA will stop immediately after installation so you can reload it to use the new installation.</p>'
                                + '<p>If you click \'No\' the EA will keep running using the previous installation untill it gets discconnected from service.</p>',
                            yes: function () {
                                onConfirmBoxClose(true);
                            },
                            no: function () {
                                onConfirmBoxClose(false);
                            }
                        });
                    },
                    no: function () {
                        _this.IsNotifyingUserOfUpdate = false;
                    },
                });
            }
        });
    };
    InstallController.InstallWith = function (file_name, immediate) {
        var _this = this;
        if (this.IsEAInstalling) {
            return;
        }
        this.IsEAInstalling = true;
        var accounts = [];
        if (file_name.endsWith('.ex4')) {
            accounts = main_1.GetSyncService().getMT4Accounts();
        }
        else if (file_name.endsWith('.ex5')) {
            accounts = main_1.GetSyncService().getMT5Accounts();
        }
        else {
            main_1.default.alert({
                title: 'Invalid',
                message: 'Invalid file type! Expected an ex4 or ex5 file'
            });
            this.IsEAInstalling = false;
            return;
        }
        var installFn = function (err, ea_paths) {
            if (err) {
                main_1.default.alert({
                    title: 'Error',
                    message: err
                });
                _this.IsEAInstalling = false;
                return;
            }
            _this.InstallWith0(ea_paths, file_name, immediate, accounts);
        };
        if (file_name.endsWith('.ex4')) {
            SyncUtil_1.SyncUtil.GetEAPathsMQL4(Config_1.Config.MT_ALL_TERMINALS_DATA_ROOT, installFn);
        }
        else if (file_name.endsWith('.ex5')) {
            SyncUtil_1.SyncUtil.GetEAPathsMQL5(Config_1.Config.MT_ALL_TERMINALS_DATA_ROOT, installFn);
        }
    };
    InstallController.InstallWith0 = function (destination_files, file_name, immediate, accounts) {
        var _this = this;
        var dest_files = Array.isArray(destination_files) ? destination_files : [destination_files];
        if (dest_files.length === 0) {
            return;
        }
        var completion = {
            OnComplete: function (response) {
                _this.IsEAInstalling = false;
                if (response.success) {
                    main_1.default.alert({
                        title: 'Success',
                        message: response.success
                    });
                }
                if (response.cancel) {
                    main_1.default.alert({
                        title: 'Cancelled',
                        message: response.cancel
                    });
                }
                if (response.error) {
                    main_1.default.alert({
                        title: 'Error',
                        message: response.error
                    });
                }
                for (var _i = 0, accounts_1 = accounts; _i < accounts_1.length; _i++) {
                    var account = accounts_1[_i];
                    account.sendEACommand('reload_ea_modified', { immediate: immediate });
                }
            }
        };
        this.copyFileMultiple(file_name, dest_files, null, completion);
    };
    InstallController.InstallEAUpdate = function (immediate) {
        var _this = this;
        if (this.IsEADowndoningInstalling) {
            return;
        }
        this.IsEADowndoningInstalling = true;
        SyncUtil_1.SyncUtil.GetEAPaths(Config_1.Config.MT_ALL_TERMINALS_DATA_ROOT, function (err, ea_paths) {
            if (err) {
                main_1.default.alert({
                    title: 'Error',
                    message: err
                });
                _this.IsEADowndoningInstalling = false;
                return;
            }
            _this.InstallEAUpdate0(ea_paths, immediate);
        });
    };
    InstallController.InstallEAUpdate0 = function (destination_files, immediate) {
        var _this = this;
        var dest_files = Array.isArray(destination_files) ? destination_files : [destination_files];
        var dest_files_mt4 = dest_files.filter(function (file) { return file.endsWith('.ex4'); });
        var dest_files_mt5 = dest_files.filter(function (file) { return file.endsWith('.ex5'); });
        if (dest_files_mt4.length === 0 && dest_files_mt5.length === 0) {
            this.IsEADowndoningInstalling = false;
            return;
        }
        if (this.installUpdateMetadataJson[this.FileIdEX4].uptodate
            && this.installUpdateMetadataJson[this.FileIdEX5].uptodate) {
            main_1.default.alert({
                title: 'Success',
                message: "The EAs are uptodate!"
            });
            this.IsEADowndoningInstalling = false;
            return;
        }
        var doing = 0;
        var done = 0;
        var success = '';
        var metadata_arr = [];
        var completion = {
            OnComplete: function (response) {
                if (response.success) {
                    success += response.success + '\n';
                }
                if (response.cancel || response.error) {
                    _this.IsEADowndoningInstalling = false;
                    if (response.cancel) {
                        main_1.default.alert({
                            title: 'Cancelled',
                            message: response.cancel
                        });
                    }
                    if (response.error) {
                        main_1.default.alert({
                            title: 'Error',
                            message: response.error
                        });
                    }
                }
                if (response.value) {
                    metadata_arr.push(response.value);
                }
                done++;
                if (doing != done) {
                    return;
                }
                //at this point it fully complete
                _this.IsEADowndoningInstalling = false;
                if (response.success) {
                    main_1.default.alert({
                        title: 'Success',
                        message: success
                    });
                }
                for (var _i = 0, metadata_arr_2 = metadata_arr; _i < metadata_arr_2.length; _i++) {
                    var metadata = metadata_arr_2[_i];
                    _this.installUpdateMetadataJson[metadata.id].fileName = metadata.name;
                    _this.installUpdateMetadataJson[metadata.id].modifiedTime = metadata.modifiedTime;
                    _this.installUpdateMetadataJson[metadata.id].uptodate = true;
                }
                _this.SaveFileMetadata(function () {
                    var accounts = main_1.GetSyncService().getAccounts();
                    for (var _i = 0, accounts_2 = accounts; _i < accounts_2.length; _i++) {
                        var account = accounts_2[_i];
                        account.sendEACommand('reload_ea_modified', { immediate: immediate });
                    }
                });
            }
        };
        var progressObj = {};
        var downloadProgress = function (file_name, progress_percent, size_downloaded, file_size) {
            //using this progress object we can calculate the actual progress percent on the client size
            progressObj[file_name] = {
                name: file_name,
                percent: progress_percent,
                amount: size_downloaded,
                size: file_size
            };
            //send the download progress to the GUI for display by progress bar
            main_1.ipcSend('reinstall-download-progress', progressObj);
        };
        if (!this.installUpdateMetadataJson[this.FileIdEX4].uptodate) {
            doing++;
            this.Download(this.FileIdEX4, Config_1.Config.TEMP_DOWNLOAD_DEST_EX4, dest_files_mt4, completion, downloadProgress);
        }
        if (!this.installUpdateMetadataJson[this.FileIdEX5].uptodate) {
            doing++;
            this.Download(this.FileIdEX5, Config_1.Config.TEMP_DOWNLOAD_DEST_EX5, dest_files_mt5, completion, downloadProgress);
        }
    };
    InstallController.ReInstallAll = function () {
        var _this = this;
        if (this.IsReinstallingAll) {
            return;
        }
        this.IsReinstallingAll = true;
        SyncUtil_1.SyncUtil.GetEAPaths(Config_1.Config.MT_ALL_TERMINALS_DATA_ROOT, function (err, ea_paths) {
            if (err) {
                main_1.default.alert({
                    title: 'Error',
                    message: err
                });
                _this.IsReinstallingAll = false;
                return;
            }
            _this.ReInstallAll0(ea_paths);
        });
    };
    InstallController.ReInstallAll0 = function (destination_files) {
        var _this = this;
        var dest_files = Array.isArray(destination_files) ? destination_files : [destination_files];
        var dest_files_mt4 = dest_files.filter(function (file) { return file.endsWith('.ex4'); });
        var dest_files_mt5 = dest_files.filter(function (file) { return file.endsWith('.ex5'); });
        if (dest_files_mt4.length === 0 && dest_files_mt5.length === 0) {
            this.IsReinstallingAll = false;
            return;
        }
        var doing = 0;
        var done = 0;
        var metadata_arr = [];
        var completion = {
            OnComplete: function (response) {
                if (response.cancel || response.error) {
                    _this.IsReinstallingAll = false;
                    if (response.cancel) {
                        main_1.default.alert({
                            title: 'Cancelled',
                            message: response.cancel
                        });
                    }
                    if (response.error) {
                        main_1.default.alert({
                            title: 'Error',
                            message: response.error
                        });
                    }
                }
                if (response.value) {
                    metadata_arr.push(response.value);
                }
                done++;
                if (doing != done) {
                    return;
                }
                //at this point it fully complete
                _this.IsReinstallingAll = false;
                if (response.success) {
                    //send special message and launch the stm-setup installer and close this app
                    main_1.default.alert({
                        title: 'Success',
                        message: response.success,
                        close: function () {
                            _this.wrapUpInstallation(metadata_arr);
                        }
                    });
                }
            }
        };
        var progressObj = {};
        var downloadProgress = function (file_name, progress_percent, size_downloaded, file_size) {
            //using this progress object we can calculate the actual progress percent on the client size
            progressObj[file_name] = {
                name: file_name,
                percent: progress_percent,
                amount: size_downloaded,
                size: file_size
            };
            //send the download progress to the GUI for display by progress bar
            main_1.ipcSend('reinstall-download-progress', progressObj);
        };
        doing++;
        this.Download(this.FileIdEX4, Config_1.Config.TEMP_DOWNLOAD_DEST_EX4, dest_files_mt4, completion, downloadProgress);
        doing++;
        this.Download(this.FileIdEX5, Config_1.Config.TEMP_DOWNLOAD_DEST_EX5, dest_files_mt5, completion, downloadProgress);
        doing++;
        this.Download(this.FileIdStmEXE, Config_1.Config.TEMP_STM_EXE_DEST, Config_1.Config.TEMP_STM_EXE_DEST, completion, downloadProgress);
    };
    InstallController.copyFileMultiple = function (source, dest_files, metadata, completion) {
        var count_done = 0;
        var err_count = 0;
        var err_str = '';
        var success_str = '';
        var copyFunc = function (err, token) {
            var dest = this;
            count_done++;
            if (err) {
                err_count++;
                err_str += err + '\n';
                console.log(err);
            }
            else {
                success_str += "Installed to :  " + dest + "\n";
            }
            if (count_done < dest_files.length) {
                return;
            }
            //at this point it is complete
            if (err_count == 0) {
                completion.OnComplete({ success: success_str, value: metadata });
            }
            else {
                completion.OnComplete({ error: err_count + " error(s) occured\n" + (count_done - err_count) + " installed.\n\nError:\n\n" + err_str });
            }
        };
        for (var _i = 0, dest_files_1 = dest_files; _i < dest_files_1.length; _i++) {
            var dest = dest_files_1[_i];
            if (dest != source) {
                fs.copyFile(source, dest, copyFunc.bind(dest));
            }
            else {
                //since the source is same as destination, no point to do any actual file copying
                copyFunc.bind(dest)();
            }
        }
    };
    /**
     * Create an OAuth2 client with the given credentials
     * @param {Object} credentials The authorization client credentials.
     */
    InstallController.Authorize = function (action, completion) {
        var _this = this;
        this.IsAuthorizing = true;
        if (this.credentials === null) {
            // Load client secrets from a local file.
            fs.readFile(this.CREDENTIALS_PATH, function (err, content) {
                if (err) {
                    completion.OnComplete({ error: 'Could not read athorization credentials' });
                    console.log('Error loading authorization credentails:', err);
                    return;
                }
                // Authorize a client with credentials.
                try {
                    _this.credentials = JSON.parse(content);
                    _this.AuthorizeAndRunTasks(action, completion);
                }
                catch (ex) {
                    completion.OnComplete({ error: 'Authorization credentials is corrupt.!' });
                    console.error(ex);
                }
            });
        }
        else {
            this.AuthorizeAndRunTasks(action, completion);
        }
    };
    InstallController.AuthorizeAndRunTasks = function (action, completion) {
        var _this = this;
        if (this.credentials == null) {
            completion.OnComplete({ error: "Credential cannot be null" });
            return;
        }
        var _a = this.credentials.installed, client_secret = _a.client_secret, client_id = _a.client_id, redirect_uris = _a.redirect_uris;
        var oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        // Check if we have previously stored a token.
        fs.readFile(this.TOKEN_PATH, function (err, token) {
            if (err)
                return _this.GetAccessTokenForAuth(oAuth2Client, action, completion);
            try {
                oAuth2Client.setCredentials(JSON.parse(token));
                _this.AfterAuthorizeAttempt(oAuth2Client, action);
            }
            catch (ex) {
                completion.OnComplete({ error: 'Authorization credentials is corrupt.!' });
                console.error(ex);
            }
        });
    };
    InstallController.AfterAuthorizeAttempt = function (oAuth2Client, action) {
        this.auth = oAuth2Client;
        this.IsAuthorizing = false;
        this.AuthorizationFiled = !oAuth2Client;
        if (this.auth) {
            action.call(this); // jsut execute the action
        }
    };
    InstallController.promptAuthorizationHTML = function (authUrl) {
        //electron.shell.openExternal('${authUrl}')
        var html = "<p>The app requires athorization:</p>\n                <p>\n                   <a href=\"#\" style=\"font-style:bold;\" onclick=\"electron.shell.openExternal('" + authUrl + "')\">\n                      CLICK HERE TO VISIT THE AUTHORIZATION PAGE\n                   </a>\n                </p>                \n                <p>Enter the code from that page here</p>";
        return html;
    };
    InstallController.SaveFileMetadata = function (callback) {
        if (callback === void 0) { callback = null; }
        fs.writeFile(Config_1.Config.INSTALL_UPDATE_METADATA, JSON.stringify(this.installUpdateMetadataJson), function (err) {
            if (err)
                return console.error(err);
            callback === null || callback === void 0 ? void 0 : callback();
        });
    };
    /**
     * Get and store new token after prompting for user authorization
     * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
     */
    InstallController.GetAccessTokenForAuth = function (oAuth2Client, action, completion) {
        var _this = this;
        var authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.SCOPES,
        });
        var msg = this.promptAuthorizationHTML(authUrl);
        main_1.default.prompt({
            title: 'Authorization Required',
            message: msg,
            input: function (code) {
                oAuth2Client.getToken(code, function (err, token) {
                    if (err) {
                        _this.AfterAuthorizeAttempt(null, action);
                        completion.OnComplete({ error: 'Could not retrieve access token!' });
                        console.error('Error retrieving access token', err);
                        return;
                    }
                    oAuth2Client.setCredentials(token);
                    // Store the token to disk for later program executions
                    fs.writeFile(_this.TOKEN_PATH, JSON.stringify(token), function (err) {
                        if (err)
                            return console.error(err);
                        console.log('Token stored to', _this.TOKEN_PATH);
                    });
                    _this.AfterAuthorizeAttempt(oAuth2Client, action);
                });
            },
            cancel: function () {
                _this.AfterAuthorizeAttempt(null, action);
                //TODO
                //do something since cancel is click. e.g send waring notification
                completion.OnComplete({ cancel: 'Cancelled by user' }); //
            },
        });
    };
    InstallController.GetMetadata = function (drive, fileId, callbak) {
        drive.files.get({
            fileId: fileId,
            fields: 'id, name, size, modifiedTime'
        }, function (err, res) {
            if (err) {
                var err_str = '';
                if (typeof err == 'object') {
                    err_str = 'The API returned an error: ' + err.message;
                }
                else {
                    err_str = 'The API returned an error: ' + err;
                }
                return callbak(err_str);
            }
            ;
            callbak(null, res.data);
        });
    };
    /**
     * Download the files.
     * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
     */
    InstallController.Download = function (fileId, tmp_dest, destinations, completion, progress) {
        var _this = this;
        if (progress === void 0) { progress = null; }
        var main_destinations = Array.isArray(destinations) ? destinations : [destinations];
        var action = function () {
            var drive = google.drive({ version: 'v3', auth: _this.auth });
            var progress_perecent = 0;
            var downloaded_size = 0;
            var remote_file_size = 0;
            var remote_file_name = '';
            var tmp_dest_stream = fs.createWriteStream(tmp_dest);
            var streamData = function (metadata) {
                drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'stream' }, function (err, res) {
                    if (err) {
                        var err_str = '';
                        if (typeof err == 'object') {
                            if (typeof err.response == 'object') {
                                err_str = 'The API returned an error: ' + (err.response.statusText ? err.response.statusText : err.response);
                            }
                            else if (err.message) {
                                err_str = 'The API returned an error: ' + err.message;
                            }
                            else {
                                err_str = 'The API returned an error: ' + err;
                            }
                        }
                        else {
                            err_str = 'The API returned an error: ' + err;
                        }
                        completion.OnComplete({ error: err_str });
                        console.log(err_str);
                        return;
                    }
                    ;
                    res.data
                        .on('end', function () {
                        //copy to the repective locations
                        _this.copyFileMultiple(tmp_dest, main_destinations, metadata, completion);
                    })
                        .on('data', function (data) {
                        downloaded_size += data.length;
                        progress_perecent = Math.ceil(downloaded_size / remote_file_size * 100);
                        progress === null || progress === void 0 ? void 0 : progress(remote_file_name, progress_perecent, downloaded_size, remote_file_size);
                    })
                        .on('error', function (err) {
                        completion.OnComplete({ error: err });
                        console.log('Error', err);
                    })
                        .pipe(tmp_dest_stream);
                });
            };
            var clearBeforeStreamData = function (metadata) {
                fs.truncate(tmp_dest, function (err) {
                    if (err) {
                        completion.OnComplete({ error: err });
                        console.log(err);
                        return;
                    }
                    streamData(metadata);
                });
            };
            _this.GetMetadata(drive, fileId, function (err, data) {
                if (err) {
                    completion.OnComplete({ error: err });
                    console.log(err);
                    return;
                }
                remote_file_name = data.name;
                remote_file_size = data.size;
                clearBeforeStreamData(data);
            });
        };
        this.AuthorizationFiled = false;
        //start authorization only if none in current going on - avoid simultaneous authorization         
        SyncUtil_1.SyncUtil.WaitAsyncWhile(this.Authorize.bind(this, action, completion), function () { return _this.IsAuthorizing; }, // keep wait while authorization is in progress by another
        function () { return _this.AuthorizationFiled; } //stop waiting and exit immediately if Authorization failed - Do not bother to start call the Authorize method
        );
    };
    // If modifying these scopes, delete token.json.
    InstallController.SCOPES = ['https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly'];
    // The file token.json stores the user's access and refresh tokens, and is
    // created automatically when the authorization flow completes for the first
    // time.
    InstallController.TOKEN_PATH = 'token.json';
    InstallController.CREDENTIALS_PATH = 'credentials.json';
    InstallController.auth = null;
    InstallController.credentials = null;
    InstallController.FileIdEX4 = '1SF-Grb36-R8ersh4_dCzu8AvqkJAk7qg'; // see it in the link https://drive.google.com/file/d/1SF-Grb36-R8ersh4_dCzu8AvqkJAk7qg/view?usp=sharing
    InstallController.FileIdEX5 = '18tDM90Wc401PrEQAiqXJ_SaOjwlCVMEB'; // see it in the link https://drive.google.com/file/d/18tDM90Wc401PrEQAiqXJ_SaOjwlCVMEB/view?usp=sharing
    InstallController.FileIdStmEXE = '1tGljjwzTBqnzTkr3bmYniXaltcSDOhQp'; // see it in the link https://drive.google.com/file/d/1tGljjwzTBqnzTkr3bmYniXaltcSDOhQp/view?usp=sharing  
    InstallController.MAX_REMOTE_REQUEST_PER_MINUTE = 2;
    InstallController.MAX_REMOTE_REQUEST_PER_HOUR = 10;
    InstallController.IsAuthorizing = false;
    InstallController.AuthorizationFiled = false;
    InstallController.installUpdateMetadataJson = {};
    InstallController.IsNotifyingUserOfUpdate = false;
    InstallController.IsEAInstalling = false;
    InstallController.IsEADowndoningInstalling = false;
    InstallController.IsReinstallingAll = false;
    InstallController.NextUpdateCheckTime = 0;
    return InstallController;
}());
exports.InstallController = InstallController;
//# sourceMappingURL=InstallController.js.map