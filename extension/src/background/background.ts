// disable by default
chrome.browserAction.disable()

chrome.runtime.onMessage.addListener((request) => {
  if (request.sdkEnabled) {
    chrome.browserAction.enable()
  }
})
