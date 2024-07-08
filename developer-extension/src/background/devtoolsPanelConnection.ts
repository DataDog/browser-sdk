import type { DevtoolsToBackgroundMessage } from '../common/extension.types'
import { EventListeners } from '../common/eventListeners'
import { createLogger } from '../common/logger'

const logger = createLogger('devtoolsPanelConnection')

type TabId = number

const devtoolsConnectionsByTabId = new Map<TabId, chrome.runtime.Port>()

const portNameRe = /^devtools-panel-for-tab-(\d+)$/

export const onDevtoolsFirstConnection = new EventListeners<TabId>()
export const onDevtoolsLastDisconnection = new EventListeners<TabId>()
export const onDevtoolsConnection = new EventListeners<TabId>()
export const onDevtoolsDisconnection = new EventListeners<TabId>()
export const onDevtoolsMessage = new EventListeners<DevtoolsToBackgroundMessage>()

export function sendMessageToDevtools(tabId: TabId, message: any) {
  const port = devtoolsConnectionsByTabId.get(tabId)

  if (!port) {
    // Extension not yet opened
    return
  }

  port.postMessage(message)
}

// Listen for connection from the devtools-panel
chrome.runtime.onConnect.addListener((port) => {
  const match = portNameRe.exec(port.name)
  if (!match) {
    return
  }

  const tabId = Number(match[1])

  logger.log(`New devtools connection for tab ${tabId}`)
  devtoolsConnectionsByTabId.set(tabId, port)

  if (devtoolsConnectionsByTabId.size === 1) {
    onDevtoolsFirstConnection.notify(tabId)
  }
  onDevtoolsConnection.notify(tabId)

  port.onMessage.addListener((message) => {
    onDevtoolsMessage.notify(message)
  })

  port.onDisconnect.addListener(() => {
    logger.log(`Remove devtools connection for tab ${tabId}`)
    devtoolsConnectionsByTabId.delete(tabId)

    onDevtoolsDisconnection.notify(tabId)
    if (devtoolsConnectionsByTabId.size === 0) {
      onDevtoolsLastDisconnection.notify(tabId)
    }
  })
})
