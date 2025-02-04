import { IncrementalSource, RecordType } from '@datadog/browser-rum/src/types'
import type { BrowserRecord } from '@datadog/browser-rum/src/types'
import { createLogger } from '../../common/logger'
import { onBackgroundMessage } from '../backgroundScriptConnection'
import type { MessageBridgeUp } from './sessionReplayPlayer.types'
import { MessageBridgeDownType, MessageBridgeUpLogLevel, MessageBridgeUpType } from './sessionReplayPlayer.types'

const sandboxLogger = createLogger('sandbox')

export type SessionReplayPlayerStatus = 'loading' | 'waiting-for-full-snapshot' | 'ready'

const sandboxOrigin = 'https://session-replay-datadoghq.com'
// To follow web-ui development, this version will need to be manually updated from time to time.
// When doing that, be sure to update types and implement any protocol changes.
const sandboxVersion = '0.68.0'
const sandboxParams = new URLSearchParams({
  staticContext: JSON.stringify({
    tabId: 'xxx',
    origin: location.origin,
    featureFlags: {
      // Allows to easily inspect the DOM in the sandbox
      rum_session_replay_iframe_interactive: true,

      // Use the service worker
      rum_session_replay_service_worker: true,
      rum_session_replay_service_worker_debug: false,

      rum_session_replay_disregard_origin: true,
    },
  }),
})
const sandboxUrl = `${sandboxOrigin}/${sandboxVersion}/index.html?${String(sandboxParams)}`

export function startSessionReplayPlayer(
  iframe: HTMLIFrameElement,
  onStatusChange: (status: SessionReplayPlayerStatus) => void
) {
  let status: SessionReplayPlayerStatus = 'loading'
  const bufferedRecords = createRecordBuffer()

  const messageBridge = createMessageBridge(iframe, () => {
    const records = bufferedRecords.consume()
    if (records.length > 0) {
      status = 'ready'
      onStatusChange(status)
      records.forEach((record) => messageBridge.sendRecord(record))
    } else {
      status = 'waiting-for-full-snapshot'
      onStatusChange(status)
    }
  })

  const backgroundMessageSubscription = onBackgroundMessage.subscribe((backgroundMessage) => {
    if (backgroundMessage.type !== 'sdk-message' || backgroundMessage.message.type !== 'record') {
      return
    }
    const record = backgroundMessage.message.payload.record
    if (status === 'loading') {
      bufferedRecords.add(record)
    } else if (status === 'waiting-for-full-snapshot') {
      if (isFullSnapshotStart(record)) {
        status = 'ready'
        onStatusChange(status)
        messageBridge.sendRecord(record)
      }
    } else {
      messageBridge.sendRecord(record)
    }
  })

  iframe.src = sandboxUrl

  return {
    stop() {
      messageBridge.stop()
      backgroundMessageSubscription.unsubscribe()
    },
  }
}

function createRecordBuffer() {
  const records: BrowserRecord[] = []

  return {
    add(record: BrowserRecord) {
      // Make sure 'records' starts with a FullSnapshot
      if (isFullSnapshotStart(record)) {
        records.length = 0
        records.push(record)
      } else if (records.length > 0) {
        records.push(record)
      }
    },
    consume(): BrowserRecord[] {
      return records.splice(0, records.length)
    },
  }
}

function isFullSnapshotStart(record: BrowserRecord) {
  // All FullSnapshot start with a "Meta" record. The FullSnapshot record comes in third position
  return record.type === RecordType.Meta
}

function normalizeRecord(record: BrowserRecord) {
  if (record.type === RecordType.IncrementalSnapshot && record.data.source === IncrementalSource.MouseMove) {
    return {
      ...record,
      data: {
        ...record.data,
        position: record.data.positions[0],
      },
    }
  }
  return record
}

function createMessageBridge(iframe: HTMLIFrameElement, onReady: () => void) {
  let nextMessageOrderId = 1

  function globalMessageListener(event: MessageEvent<MessageBridgeUp>) {
    if (event.origin === sandboxOrigin) {
      const message = event.data
      if (message.type === MessageBridgeUpType.LOG) {
        if (message.level === MessageBridgeUpLogLevel.ERROR) {
          sandboxLogger.error(message.message)
        } else {
          sandboxLogger.log(message.message)
        }
      } else if (message.type === MessageBridgeUpType.ERROR) {
        sandboxLogger.error(
          `${message.serialisedError.name}: ${message.serialisedError.message}`,
          message.serialisedError.stack
        )
      } else if (message.type === MessageBridgeUpType.READY) {
        onReady()
      } else {
        // Ignore other messages for now.
      }
    }
  }

  window.addEventListener('message', globalMessageListener)
  return {
    stop: () => {
      window.removeEventListener('message', globalMessageListener)
    },

    sendRecord(record: BrowserRecord) {
      iframe.contentWindow!.postMessage(
        {
          type: MessageBridgeDownType.RECORDS,
          records: [
            {
              ...normalizeRecord(record),
              viewId: 'xxx',
              orderId: nextMessageOrderId,
              isSeeking: false,
              shouldWaitForIt: false,
              segmentSource: 'browser',
            },
          ],
          sentAt: Date.now(),
        },
        sandboxOrigin
      )

      nextMessageOrderId++
    },
  }
}
