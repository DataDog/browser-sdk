import type { BrowserRecord } from '@datadog/browser-rum/src/types'
import { createLogger } from '../../common/logger'
import { onBackgroundMessage } from '../backgroundScriptConnection'
import { NoSandboxBuildError } from './getReplaySandboxLocation'
import type { ReplaySandbox, ReplaySandboxOptions } from './replaySandbox'
import { createReplaySandbox } from './replaySandbox'
import { isMouseMovementRecord } from './recordUtils'
import type { PlayerStateStoreOptions } from './playerStateStore'
import { createPlayerStateStore } from './playerStateStore'

export type { SessionReplayPlayerState } from './playerStateStore'

const logger = createLogger('startSessionReplayPlayer')

export interface SessionReplayPlayer {
  getRecords(): BrowserRecord[]
  setExcludeMouseMovements(shouldExcludeMouseMovements: boolean): void
}

export type SessionReplayPlayerOptions = PlayerStateStoreOptions & ReplaySandboxOptions

/**
 * Replays the SDK's records in the replay sandbox. Playback terminates when the signal is
 * aborted.
 */
export function startSessionReplayPlayer(options: SessionReplayPlayerOptions): SessionReplayPlayer {
  const { signal } = options
  const store = createPlayerStateStore(options)

  // Subscribe before loading the sandbox, so that the records received meanwhile are buffered.
  const backgroundMessageSubscription = onBackgroundMessage.subscribe((backgroundMessage) => {
    if (backgroundMessage.type !== 'sdk-message' || backgroundMessage.message.type !== 'record') {
      return
    }

    const record = backgroundMessage.message.payload.record

    // Check if this is a mouse movement that should be excluded.
    if (store.excludeMouseMovements && isMouseMovementRecord(record)) {
      return // Skip adding this record entirely.
    }

    store.bufferedRecords.add(record)
  })
  signal.addEventListener('abort', () => backgroundMessageSubscription.unsubscribe())

  // Load the sandbox.
  void (async () => {
    let sandbox: ReplaySandbox
    try {
      sandbox = await createReplaySandbox(options)
    } catch (error) {
      if (!signal.aborted) {
        if (error instanceof NoSandboxBuildError) {
          store.status = 'no-sandbox-build'
        } else {
          logger.error('While loading the replay sandbox:', error)
          store.status = 'error'
        }
      }
      return
    }

    store.status = 'waiting-for-full-snapshot'
    store.bufferedRecords.addListener((record) => {
      store.status = 'ready'
      sandbox.sendRecord(record)
    })
  })()

  return {
    getRecords() {
      return store.bufferedRecords.getRecords()
    },
    setExcludeMouseMovements(shouldExcludeMouseMovements: boolean) {
      store.excludeMouseMovements = shouldExcludeMouseMovements
    },
  }
}
