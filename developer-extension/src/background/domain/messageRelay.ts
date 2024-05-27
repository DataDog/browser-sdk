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
import {
  onDevtoolsFirstConnection,
  onDevtoolsLastDisconnection,
  sendMessageToDevtools,
} from '../devtoolsPanelConnection'

const logger = createLogger('messageRelay')

const CONTENT_SCRIPTS: Array<{
  id: string
  file: string
  world: chrome.scripting.ExecutionWorld
}> = [
  {
    id: 'browser-sdk-content-script-main',
    file: './content-script-main.js',
    world: 'MAIN',
  },
  {
    id: 'browser-sdk-content-script-isolated',
    file: './content-script-isolated.js',
    world: 'ISOLATED',
  },
]

onDevtoolsFirstConnection.subscribe((tabId) => {
  // Register content scripts when a first devtools panel is open
  registerContentScripts(tabId).catch((error) => logger.error('Error while registering content scripts:', error))
})

onDevtoolsLastDisconnection.subscribe(() => {
  // Unregister content scripts when the last devtools panel is open
  unregisterContentScripts().catch((error) => logger.error('Error while unregistering content scripts:', error))
})

// Listen for messages coming from the "isolated" content-script and relay them to a potential
// devtools panel connection.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab && sender.tab.id) {
    sendMessageToDevtools(sender.tab.id, { type: 'sdk-message', message })
  }
})

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
        target: {
          allFrames: true,
          tabId,
        },
        world: script.world,
        files: [script.file],
      })
    )
  )
}
