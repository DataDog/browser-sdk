import { IncrementalSource, RecordType } from '../../../../packages/rum/src/types'
import { createLogger } from '../../common/logger'
import type { SdkMessage } from '../backgroundScriptConnection'
import { listenSdkMessages } from '../backgroundScriptConnection'
import { evalInWindow } from '../evalInWindow'
import type { MessageBridgeDown, MessageBridgeUp } from './types'
import { MessageBridgeDownType } from './types'

const sandboxLogger = createLogger('sandbox')
const logger = createLogger('startSessionReplayPlayer')

type SessionReplayPlayerState =
  | {
      status: 'loading'
    }
  | {
      status: 'ready'
      stop: () => void
    }

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
const sandboxOrigin = 'https://session-replay-datadoghq.com'
const sandboxUrl = `${sandboxOrigin}/0.58.0/index.html?${String(sandboxParams)}`

export function startSessionReplayPlayer(iframe: HTMLIFrameElement) {
  let state: SessionReplayPlayerState = {
    status: 'loading',
  }

  window.addEventListener('message', (event) => {
    if (event.origin === sandboxOrigin) {
      onMessageBridgeUp(event.data)
    }
  })

  function postMessageBridgeDown(message: MessageBridgeDown) {
    iframe.contentWindow!.postMessage(message, sandboxOrigin)
  }

  iframe.src = sandboxUrl

  function onMessageBridgeUp(message: MessageBridgeUp) {
    if (message.type === 'log') {
      if (message.level === 'error') {
        sandboxLogger.error(message.message)
      } else {
        sandboxLogger.log(message.message)
      }
    } else if (message.type === 'error') {
      sandboxLogger.error(
        `${message.serialisedError.name}: ${message.serialisedError.message}`,
        message.serialisedError.stack
      )
    } else if (message.type === 'ready') {
      onReady()
    } else {
      console.log('MESSAGE', message)
    }
  }

  function onReady() {
    if (state.status === 'loading') {
      logger.log('Start listening to SDK events')
      const stopListeningToSdkMessages = listenSdkMessages(onSdkMessage)
      state = {
        status: 'ready',
        stop: () => {
          stopListeningToSdkMessages()
        },
      }
      // Restart to make sure we have a fresh Full Snapshot
      evalInWindow(`
        DD_RUM.stopSessionReplayRecording()
        DD_RUM.startSessionReplayRecording()
      `).catch((error) => {
        logger.error('While restarting recording:', error)
      })
    }
  }

  function onSdkMessage(message: SdkMessage) {
    if (message.type === 'record') {
      const record = message.payload.record
      let normalizedRecord
      if (record.type === RecordType.IncrementalSnapshot && record.data.source === IncrementalSource.MouseMove) {
        normalizedRecord = {
          ...record,
          data: {
            ...record.data,
            position: record.data.positions[0],
          },
        }
      } else {
        normalizedRecord = record
      }

      postMessageBridgeDown({
        type: MessageBridgeDownType.RECORDS,
        records: [
          {
            ...normalizedRecord,
            viewId: 'xxx',
            orderId: getNextMessageOrderId(),
            isSeeking: false,
            shouldWaitForIt: false,
          },
        ],
        sentAt: Date.now(),
      })
    }
  }

  let nextMessageOrderId = 1
  function getNextMessageOrderId() {
    return nextMessageOrderId++
  }
}
