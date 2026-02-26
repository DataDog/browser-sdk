import { PageExitReason } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { ViewCreatedEvent } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { createMockRumPipeline } from '../../rum-core/test'

type MockRumPipeline = ReturnType<typeof createMockRumPipeline>

/**
 * Bridges LifeCycle events to pipeline signals for test files in the `rum` package.
 *
 * This wires VIEW_CREATED, PAGE_MAY_EXIT, SESSION_EXPIRED and SESSION_RENEWED from the
 * LifeCycle to the synchronous mock pipeline, allowing existing tests that trigger events
 * via `lifeCycle.notify(...)` to exercise pipeline subscribers without modification.
 *
 * Subscriptions are automatically unregistered via `registerCleanupTask`.
 */
export function bridgeLifeCycleToPipeline(lifeCycle: LifeCycle, pipeline: MockRumPipeline): void {
  const viewCreatedSub = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view: ViewCreatedEvent) => {
    pipeline.notifySignal({ type: 'viewCreated', viewId: view.id, name: view.name, startClocks: view.startClocks })
  })

  const pageMayExitSub = lifeCycle.subscribe(LifeCycleEventType.PAGE_MAY_EXIT, (event) => {
    const reason =
      event.reason === PageExitReason.HIDDEN
        ? ('visibility_hidden' as const)
        : event.reason === PageExitReason.PAGEHIDE
          ? ('page_hide' as const)
          : event.reason === PageExitReason.FROZEN
            ? ('page_frozen' as const)
            : ('before_unload' as const)
    pipeline.notifySignal({ type: 'pageMayExit', reason })
  })

  const sessionExpiredSub = lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
    pipeline.notifySignal({ type: 'sessionExpired' })
  })

  const sessionRenewedSub = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    pipeline.notifySignal({ type: 'sessionRenewed', sessionId: 'renewed-session-id' })
  })

  registerCleanupTask(() => {
    viewCreatedSub.unsubscribe()
    pageMayExitSub.unsubscribe()
    sessionExpiredSub.unsubscribe()
    sessionRenewedSub.unsubscribe()
  })
}
