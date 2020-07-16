// disable by default
chrome.browserAction.disable()

import { addOrUpdateViews, View } from '../lib/rumEvents'

const tabsState: { [tabId: number]: boolean } = {}
let tabsViews: View[] = []

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.sdkEnabled) {
    chrome.browserAction.enable()
    tabsState[sender.tab.id] = true
  }

  if (request.view) {
    chrome.browserAction.enable()
    tabsViews = addOrUpdateViews(request.view as View, tabsViews)
  }
})

chrome.runtime.onConnect.addListener((popupConnection) => {
  popupConnection.onMessage.addListener((message) => {
    if (message.type === 'hello') {
      popupConnection.postMessage({ data: Object.keys(tabsState).length })
    }

    if (message.type === 'refreshViews') {
      console.log('backGround refreshViews')
      popupConnection.postMessage({ views: tabsViews })
    }
  })
})
