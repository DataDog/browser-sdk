import type { Duration } from '../entries/time'
import { ONE_SECOND } from '../entries/time'
import { Observable } from '../util/observable'
import { isWorkerEnvironment } from '../util/globalObject'
import type { TimeoutId } from '../util/timer'
import { clearTimeout, setTimeout } from '../util/timer'
import { RECOMMENDED_REQUEST_BYTES_LIMIT } from './payload'

/**
 * The reason a page-exit flush was triggered.
 *
 * These string values are also recorded in RUM events, so they must not be
 * changed without a corresponding intake schema update.
 */
export const PageExitReason = {
  HIDDEN: 'visibility_hidden',
  UNLOADING: 'before_unload',
  PAGEHIDE: 'page_hide',
  FROZEN: 'page_frozen',
} as const

/** @see {@link PageExitReason} */
export type PageExitReason = (typeof PageExitReason)[keyof typeof PageExitReason]

/** Event emitted by a page-may-exit observable when the page is about to become inactive. */
export interface PageMayExitEvent {
  reason: PageExitReason
}

/**
 * Returns `true` when `reason` is a {@link PageExitReason} value.
 *
 * @param reason - Any string to test.
 */
export function isPageExitReason(reason: string): reason is PageExitReason {
  return Object.values(PageExitReason).includes(reason as PageExitReason)
}

/**
 * A flush triggered by a page-exit signal — the most urgent kind because the
 * page may unload before a normal flush cycle completes.
 */
export type UrgentFlushReason = PageExitReason

/**
 * All possible reasons a batch flush can be triggered.
 *
 * - Page-exit reasons (`UrgentFlushReason`) are the most urgent.
 * - `'duration_limit'` fires after {@link FLUSH_DURATION_LIMIT} to keep ALB connections alive.
 * - `'bytes_limit'` fires when the batch approaches the recommended request size.
 * - `'messages_limit'` fires when the message count reaches {@link MESSAGES_LIMIT}.
 * - `'session_expire'` fires when the SDK session ends.
 */
export type FlushReason = UrgentFlushReason | 'duration_limit' | 'bytes_limit' | 'messages_limit' | 'session_expire'

/**
 * Flush automatically — aim to stay below the ALB connection timeout to maximise connection reuse.
 */
export const FLUSH_DURATION_LIMIT = (30 * ONE_SECOND) as Duration

/**
 * Maximum number of messages per batch.
 *
 * In Worker environments the limit is 1 to ensure each batch fits in a single postMessage event.
 */
export const MESSAGES_LIMIT = isWorkerEnvironment ? 1 : 50

/** The inferred return type of {@link createFlushController}. */
export type FlushController = ReturnType<typeof createFlushController>

/** Payload emitted on `flushObservable` each time a batch is flushed. */
export interface FlushEvent {
  /** Why the flush was triggered. */
  reason: FlushReason
  /** Total byte count of the messages in the flushed batch. */
  bytesCount: number
  /** Number of messages in the flushed batch. */
  messagesCount: number
}

interface FlushControllerOptions {
  /**
   * Observable that fires when the page is about to become inactive.
   * Provided by callers so this module stays free of browser-specific code.
   */
  pageMayExitObservable: Observable<PageMayExitEvent>
}

/**
 * Returns a flush controller: an object responsible for deciding when a pool of
 * pending messages should be sent to the intake.
 *
 * Flush can be triggered by:
 * - page exit (urgent, via the injected `pageMayExitObservable`)
 * - accumulated byte count reaching {@link RECOMMENDED_REQUEST_BYTES_LIMIT}
 * - message count reaching {@link MESSAGES_LIMIT}
 * - a periodic timer firing after {@link FLUSH_DURATION_LIMIT}
 * - an explicit {@link FlushController.forceFlush} call
 *
 * The implementation supports both synchronous and asynchronous callers but
 * relies on the invariants documented on each method to stay coherent.
 *
 * @param options - Configuration; see {@link FlushControllerOptions}.
 * @param options.pageMayExitObservable - Observable signalling imminent page unload.
 */
export function createFlushController({ pageMayExitObservable }: FlushControllerOptions) {
  let forcedFlushReason: FlushReason | undefined
  const prepareUrgentFlushObservable = new Observable<UrgentFlushReason>()
  const pageMayExitSubscription = pageMayExitObservable.subscribe((event) => {
    forcedFlushReason = event.reason
    try {
      prepareUrgentFlushObservable.notify(event.reason)
    } finally {
      forcedFlushReason = undefined
    }
    flush(event.reason)
  })

  const flushObservable = new Observable<FlushEvent>(() => () => {
    pageMayExitSubscription.unsubscribe()
  })

  let currentBytesCount = 0
  let currentMessagesCount = 0

  function flush(flushReason: FlushReason) {
    if (currentMessagesCount === 0) {
      return
    }

    const messagesCount = currentMessagesCount
    const bytesCount = currentBytesCount

    currentMessagesCount = 0
    currentBytesCount = 0
    cancelDurationLimitTimeout()

    flushObservable.notify({
      reason: flushReason,
      messagesCount,
      bytesCount,
    })
  }

  let durationLimitTimeoutId: TimeoutId | undefined
  function scheduleDurationLimitTimeout() {
    if (durationLimitTimeoutId === undefined) {
      durationLimitTimeoutId = setTimeout(() => {
        flush('duration_limit')
      }, FLUSH_DURATION_LIMIT)
    }
  }

  function cancelDurationLimitTimeout() {
    clearTimeout(durationLimitTimeoutId)
    durationLimitTimeoutId = undefined
  }

  return {
    flushObservable,
    prepareUrgentFlushObservable,
    forceFlush: flush,
    get messagesCount() {
      return currentMessagesCount
    },

    /**
     * Notifies that a message is about to be added to the pending pool.
     *
     * Must be called synchronously, immediately before adding the message, so
     * that no flush event can occur between this call and the actual addition.
     *
     * @param estimatedMessageBytesCount - Estimated byte size of the message once added.
     */
    notifyBeforeAddMessage(estimatedMessageBytesCount: number) {
      if (currentBytesCount + estimatedMessageBytesCount >= RECOMMENDED_REQUEST_BYTES_LIMIT) {
        flush(forcedFlushReason ?? 'bytes_limit')
      }
      // Consider the message to be added now rather than in `notifyAfterAddMessage`, because if no
      // message was added yet and `notifyAfterAddMessage` is called asynchronously, we still want
      // to notify when a flush is needed (for example on page exit).
      currentMessagesCount += 1
      currentBytesCount += estimatedMessageBytesCount
      scheduleDurationLimitTimeout()
    },

    /**
     * Notifies that a message was added to the pending pool.
     *
     * May be called asynchronously after the addition, but must not be called if
     * a flush occurred between the addition and this call.
     *
     * @param messageBytesCountDiff - Difference between the estimated and actual byte size.
     * Defaults to `0` when the estimate was exact.
     */
    notifyAfterAddMessage(messageBytesCountDiff = 0) {
      currentBytesCount += messageBytesCountDiff

      if (currentMessagesCount >= MESSAGES_LIMIT) {
        flush(forcedFlushReason ?? 'messages_limit')
      } else if (currentBytesCount >= RECOMMENDED_REQUEST_BYTES_LIMIT) {
        flush(forcedFlushReason ?? 'bytes_limit')
      }
    },
  }
}
