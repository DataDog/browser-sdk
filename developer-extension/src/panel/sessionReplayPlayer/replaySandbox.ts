import type { BrowserRecord } from '@datadog/browser-rum/src/types'
import { createLogger } from '../../common/logger'
import type { ReplaySandboxLocation, ReplaySandboxLocationOptions } from './getReplaySandboxLocation'
import { getReplaySandboxLocation } from './getReplaySandboxLocation'
import type { MessageBridgeDownRecords, MessageBridgeUp, StaticFrameContext } from './sessionReplayPlayer.types'
import { MessageBridgeDownType, MessageBridgeUpLogLevel, MessageBridgeUpType } from './sessionReplayPlayer.types'
import { isMouseMovementRecord } from './recordUtils'

const sandboxLogger = createLogger('sandbox')

export interface ReplaySandbox {
  sendRecord(record: BrowserRecord): void
}

export interface ReplaySandboxOptions extends ReplaySandboxLocationOptions {
  iframe: HTMLIFrameElement
  sandboxFeatureFlags: string[]
}

export async function createReplaySandbox({
  iframe,
  sandboxFeatureFlags,
  signal,
  source,
}: ReplaySandboxOptions): Promise<ReplaySandbox> {
  const sandboxLocation = await getReplaySandboxLocation({ source, signal })
  signal.throwIfAborted()

  const sandboxId = crypto.randomUUID()

  await new Promise<void>((resolve) => {
    function globalMessageListener(event: MessageEvent<MessageBridgeUp>) {
      if (event.origin !== sandboxLocation.origin || event.source !== iframe.contentWindow) {
        return
      }
      const message = event.data
      if (message.sandboxId !== sandboxId) {
        return
      }
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
        resolve()
      } else {
        // Ignore other messages for now.
      }
    }

    // Start listening before loading starts to ensure that we won't miss any events.
    window.addEventListener('message', globalMessageListener, { signal })

    // Stop waiting if the signal is aborted before the sandbox is ready.
    signal.addEventListener('abort', () => resolve())

    // Begin loading the replay sandbox in the iframe.
    iframe.src = createSandboxUrl(sandboxLocation, sandboxId, sandboxFeatureFlags)
  })
  signal.throwIfAborted()

  const sandboxWindow = iframe.contentWindow
  if (!sandboxWindow) {
    throw new Error('The replay sandbox iframe has no content window')
  }

  let nextMessageOrderId = 1

  return {
    sendRecord: (record: BrowserRecord) => {
      const message: MessageBridgeDownRecords = {
        type: MessageBridgeDownType.RECORD,
        record: {
          ...normalizeRecord(record),
          viewId: 'xxx',
          orderId: nextMessageOrderId,
          isSeeking: false,
          shouldWaitForIt: false,
          segmentSource: 'browser',
          applicationId: 'xxx',
        },
        sentAt: Date.now(),
      }
      sandboxWindow.postMessage(message, sandboxLocation.origin)

      nextMessageOrderId++
    },
  }
}

function createSandboxUrl(
  sandboxLocation: ReplaySandboxLocation,
  sandboxId: string,
  sandboxFeatureFlags: string[]
): string {
  const staticContext: StaticFrameContext = {
    sandboxId,
    origin: location.origin,
    featureFlags: {
      ...Object.fromEntries(sandboxFeatureFlags.map((flagName) => [flagName, true])),
      // Makes the replayed DOM easy to inspect.
      rum_session_replay_iframe_interactive: true,
      // Lets the sandbox talk to the extension's chrome-extension:// origin.
      rum_session_replay_disregard_origin: true,
    },
  }
  const url = new URL(sandboxLocation.url)
  url.searchParams.set('staticContext', JSON.stringify(staticContext))
  return url.href
}

function normalizeRecord(record: BrowserRecord) {
  if (isMouseMovementRecord(record)) {
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
