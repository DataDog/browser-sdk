// disable by default
chrome.browserAction.disable()

import { addOrUpdateViews, View } from '../lib/rumEvents'

const tabsState: { [tabId: number]: { views: View[] } } = {}

/**
 * MESSAGES BETWEEN EXTENSION AND BACKGROUND PAGE
 */
chrome.runtime.onMessage.addListener((request, sender) => {
  switch(request.type) {
    case 'enableExtension':
      chrome.browserAction.enable(sender.tab.id)
      tabsState[sender.tab.id] = { views: [] }
      break;
    case 'addOrUpdateViews':
      tabsState[sender.tab.id].views = addOrUpdateViews(request.payload as View, tabsState[sender.tab.id].views)
      break;
    default:
      break;
  }
})

/**
 * MESSAGES BETWEEN EXTENSION AND POPUP
 */
chrome.runtime.onConnect.addListener((popupConnection) => {
  popupConnection.onMessage.addListener((message) => {
    switch(message.type) {
      case 'init':
      case 'refreshViews':
        chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
          if(!tabs[0].id) {
            console.error('no active tab ¯\_(ツ)_/¯')
            return;
          }

          popupConnection.postMessage({ type: 'views', payload: tabsState[tabs[0].id].views })
        });
        break;
      default:
        break;
    }
  })
})
