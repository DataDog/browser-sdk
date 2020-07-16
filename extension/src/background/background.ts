// disable by default
chrome.browserAction.disable()

chrome.runtime.onMessage.addListener((request) => {
    if (request.sdkEnabled) {
        chrome.browserAction.enable()
        chrome.browserAction.setIcon({path:chrome.extension.getURL('/assets/images/bits.png')})
    }
});