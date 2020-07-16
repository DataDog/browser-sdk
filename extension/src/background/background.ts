// disable by default
chrome.browserAction.disable()

const tabsState: { [tabId: number]: boolean } = {}

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.sdkEnabled) {
    chrome.browserAction.enable()
    tabsState[sender.tab.id] = true
  }
})

chrome.runtime.onConnect.addListener((popupConnection) => {
  popupConnection.onMessage.addListener((message) => {
    if (message.type === 'hello') {
      popupConnection.postMessage({ data: Object.keys(tabsState).length })
    }
  })
})
