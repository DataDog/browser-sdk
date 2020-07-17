import { addOrUpdateViews, updateViewDetails } from '../lib/processEvents'
import { View, ViewDetail } from '../lib/rumEvents'

const tabsState: { [tabId: number]: { views: View[]; viewDetails: ViewDetail[] } } = {}
const stub: ViewDetail[] = [
  {
    date: 0,
    description: 'plop',
    events: [
      {
        date: 0,
        description: 'foo',
        event: {
          a: 'b',
        },
      },
    ],
    id: '1234',
  },
  {
    date: 1,
    description: 'pouet',
    events: [
      {
        date: 0,
        description: 'bar',
        event: {
          b: 'c',
        },
      },
      {
        date: 1,
        description: 'qux',
        event: {
          d: 'e',
        },
      },
    ],
    id: '7890',
  },
]

/**
 * MESSAGES BETWEEN EXTENSION AND BACKGROUND PAGE
 */
chrome.runtime.onMessage.addListener((request, sender) => {
  const tabId = sender.tab.id
  switch (request.type) {
    case 'enableExtension':
      chrome.pageAction.show(tabId)
      chrome.pageAction.setIcon({ tabId, path: chrome.extension.getURL('/assets/images/bits128.png') })
      break
    case 'addOrUpdateViews':
      // TODO remove me
      if (!tabsState[tabId]) {
        tabsState[tabId] = { views: [], viewDetails: [] }
      }
      tabsState[tabId].views = addOrUpdateViews(request.payload as View, tabsState[tabId].views)
      break
    case 'eventReceived':
      if (!tabsState[tabId]) {
        tabsState[tabId] = { views: [], viewDetails: [] }
      }
      tabsState[tabId].viewDetails = updateViewDetails(request.event, tabsState[tabId].viewDetails)
      break
    default:
      break
  }
})

/**
 * MESSAGES BETWEEN EXTENSION AND POPUP
 */
chrome.runtime.onConnect.addListener((popupConnection) => {
  popupConnection.onMessage.addListener((message) => {
    switch (message.type) {
      case 'init':
      case 'refreshViews':
        chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
          if (!tabs[0].id) {
            console.error('no active tab ¯_(ツ)_/¯')
            return
          }

          popupConnection.postMessage({ type: 'views', payload: tabsState[tabs[0].id].views })
        })
        break
      case 'refreshViewDetails':
        chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
          if (!tabs[0].id) {
            console.error('no active tab ¯_(ツ)_/¯')
            return
          }

          popupConnection.postMessage({ type: 'viewDetails', payload: stub })
        })
        break
      default:
        break
    }
  })
})
