// This file implements a way to relay messages from the web page to the devtools script. Basically,
// the devtools panel cannot simply listen for messages on the inspected page. Instead, messages
// from the web page are relayed through a list of scripts:
//
// 1. web-page calls a global callback defined by a "main" content script
// 2. the "main" content script relays the message to an "isolated" content script via a custom
//    event
// 3. the "isolated" content script relays the message to the background script via the
//    chrome.runtime.sendMessage API
// 4. the background script relays the message to the devtools panel via a persistent connection
//    (chrome.runtime.Port)
//
// Steps 2, 3 and 4 are a solution advised in the documentation provided by Google Chrome:
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

  if (devtoolsConnections.size === 1) {
    // Register content scripts when a first devtools panel is open
    registerContentScripts(tabId).catch((error) => logger.error('Error while registering content scripts:', error))
  }

  port.onDisconnect.addListener(() => {
    logger.log(`Remove devtools connection for tab ${tabId}`)
    devtoolsConnections.delete(tabId)
    if (devtoolsConnections.size === 0) {
      // Unregister content scripts when the last devtools panel is open
      unregisterContentScripts().catch((error) => logger.error('Error while unregistering content scripts:', error))
    }
  })
})

// Listen for messages coming from the "isolated" content-script and relay them to a potential
// devtools panel connection.
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

const CONTENT_SCRIPTS: Array<{
  id: string
  file: string
  world: chrome.scripting.ExecutionWorld
}> = [
  {
    id: 'browser-sdk-content-script-main',
    world: 'MAIN',
    file: './content-script-main.js',
  },
  {
    id: 'browser-sdk-content-script-isolated',
    world: 'ISOLATED',
    file: './content-script-isolated.js',
  },
]

async function unregisterContentScripts() {
  logger.log('Unregistering content scripts')
  try {
    await chrome.scripting.unregisterContentScripts({ ids: CONTENT_SCRIPTS.map((script) => script.id) })
  } catch {
    // This will throw an error when scripts are not registered. Just ignore it.
  }
}

async function registerContentScripts(tabId: number) {
  // We always refresh the content scripts, just in case they changed.
  await unregisterContentScripts()

  logger.log('Registering content scripts')
  await chrome.scripting.registerContentScripts(
    CONTENT_SCRIPTS.map((script) => ({
      id: script.id,
      allFrames: true,
      js: [script.file],
      matches: ['<all_urls>'],
      world: script.world,
      runAt: 'document_start',
    }))
  )

  // Execute scripts in the tab where the devtools panel was first open, so we don't need to refresh
  // the page to see events flowing.
  await Promise.all(
    CONTENT_SCRIPTS.map((script) =>
      chrome.scripting.executeScript({
        files: [script.file],
        world: script.world,
        target: {
          tabId,
          allFrames: true,
        },
      })
    )
  )
}
