const { MSICreator } = require('electron-wix-msi');

// Step 1: Instantiate the MSICreator
const msiCreator = new MSICreator({
    appDirectory: __dirname + '/out/sync-trading-js-win32-x64',
    outputDirectory: __dirname + '/out/stm-setup',

    // Configure metadata
    description: 'This app sync two trading accounts for risk free trading',
    exe: 'sync-trading-js',
    name: 'Sync Trading App',
    manufacturer: 'Chuks Alimele',
    version: '1.0.0',

    // Configure installer User Interface
    ui: {
        chooseDirectory: true
    },
});

install();

async function install() {
    // Step 2: Create a .wxs template file
    const { supportBinaries } = await msiCreator.create();

    //console.log(supportBinaries);
    // ?? Step 2a: optionally sign support binaries if you
    // sign you binaries as part of of your packaging script

    /*supportBinaries.forEach(async (binary) => {
        //console.log("binary ",binary);
        // Binaries are the new stub executable and optionally
        // the Squirrel auto updater.

        //await signFile(binary);
    });*/

    // Step 3: Compile the template to a .msi file
    await msiCreator.compile();
}