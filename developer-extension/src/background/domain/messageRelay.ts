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

const devtoolsConnections = new Map<number, chrome.runtime.Port>()

// Listen for connection from the devtools-panel
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'devtools-panel') {
    return
  }

  port.onMessage.addListener((message) => {
    if (message.name === 'init') {
      devtoolsConnections.set(message.tabId, port)
    }
  })

  port.onDisconnect.addListener(() => {
    for (const [tabId, otherPort] of Array.from(devtoolsConnections)) {
      if (port === otherPort) {
        devtoolsConnections.delete(tabId)
      }
    }
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
