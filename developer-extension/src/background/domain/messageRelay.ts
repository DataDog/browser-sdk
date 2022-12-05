// This file implements a way to relay messages from the web page to the devtools script. Basically,
// the devtools panel cannot simply listen for messages on the inspected page. Instead:
//
// * When the devtools panel opens, a messaging connection is created with the background script.
//   This connection is associated with the inspected tab id in the background script memory.
//
// * When the page is loaded, a content-script is executed which listen to Browser SDK messages and
//   send them to the background script.
//
// * The background script listens for messages from the content-script and send them to the
//   devtools panel if a connection exists
//
// This is the solution advised in the documentation provided by Google Chrome:
// https://developer.chrome.com/docs/extensions/mv3/devtools/#content-script-to-devtools

import { createLogger } from '../../common/logger'

const logger = createLogger('messageRelay')

const devtoolsConnections = new Map<number, chrome.runtime.Port>()

const portNameRe = /^devtools-panel-for-tab-(\d+)$/

// Listen for connection from the devtools-panel
chrome.runtime.onConnect.addListener((port) => {
  const match = portNameRe.exec(port.name)
  if (!match) {
    return
  }

  const tabId = Number(match[1])

  logger.log(`New devtools connection for tab ${tabId}`)
  devtoolsConnections.set(tabId, port)

  port.onDisconnect.addListener(() => {
    logger.log(`Remove devtools connection for tab ${tabId}`)
    devtoolsConnections.delete(tabId)
  })
})

// Listen for messages coming from the content-script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab || !sender.tab.id) {
    return
  }

  const port = devtoolsConnections.get(sender.tab.id)
  if (!port) {
    // Extension not yet opened
    return
  }

  port.postMessage(message)
})
