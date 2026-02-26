import type { Subscription } from '@datadog/browser-core'
import type { Pipeline } from '@datadog/browser-core-next'
import type { RumCoreEvents, RumSignal } from '../src/domain/pipeline/rumPipelineEvents'

/**
 * Creates a mock pipeline suitable for unit tests.
 *
 * Signal events (type 'signal') are delivered synchronously to subscribers, bypassing the
 * real Pipeline's async decorator queue. This allows existing test patterns to work without
 * converting tests to async.
 *
 * Other event types are accepted but not delivered (no-op), which is sufficient for tests
 * that only care about signal behavior.
 */
export function createMockRumPipeline(): Pipeline<RumCoreEvents> & {
  notifySignal: (signal: RumSignal) => void
} {
  const signalHandlers: Array<(signal: RumSignal) => void> = []

  function subscribe(eventType: string, handler: (event: any) => void): Subscription {
    if (eventType === 'signal') {
      signalHandlers.push(handler as (signal: RumSignal) => void)
      return {
        unsubscribe() {
          const idx = signalHandlers.indexOf(handler as (signal: RumSignal) => void)
          if (idx !== -1) {
            signalHandlers.splice(idx, 1)
          }
        },
      }
    }
    return { unsubscribe: () => {} }
  }

  function publish(eventType: string, data: any): void {
    if (eventType === 'signal') {
      notifySignal(data as RumSignal)
    }
    // Other event types are no-ops in test context
  }

  function notifySignal(signal: RumSignal): void {
    signalHandlers.slice().forEach((handler) => handler(signal))
  }

  return {
    subscribe,
    publish,
    notifySignal,
    decorate: () => {},
    seal: () => {},
  } as unknown as Pipeline<RumCoreEvents> & { notifySignal: (signal: RumSignal) => void }
}
