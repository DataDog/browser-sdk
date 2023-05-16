import { EventListeners } from '../common/eventListeners'
import { createLogger } from '../common/logger'

const logger = createLogger('devtoolsPanelConnection')

const devtoolsConnections = new Map<number, chrome.runtime.Port>()

const portNameRe = /^devtools-panel-for-tab-(\d+)$/

export const onDevtoolsFirstConnection = new EventListeners<number>()
export const onDevtoolsLastDisconnection = new EventListeners<number>()

export function sendMessageToDevtools(tabId: number, message: any) {
  const port = devtoolsConnections.get(tabId)

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
  devtoolsConnections.set(tabId, port)

  if (devtoolsConnections.size === 1) {
    onDevtoolsFirstConnection.notify(tabId)
  }

  port.onDisconnect.addListener(() => {
    logger.log(`Remove devtools connection for tab ${tabId}`)
    devtoolsConnections.delete(tabId)
    if (devtoolsConnections.size === 0) {
      onDevtoolsLastDisconnection.notify(tabId)
    }
  })
})
