import * as SDK from "azure-devops-extension-sdk";

async function initialize() {
    console.log('Minimal extension loaded');
    try {
        SDK.init();
    } catch (e) {
        console.log('SDK init error:', e);
    }
    
    await SDK.ready();
    console.log('SDK ready');
    SDK.notifyLoadSucceeded();
}

initialize().catch(error => {
    console.error('Extension initialization failed:', error);
});
