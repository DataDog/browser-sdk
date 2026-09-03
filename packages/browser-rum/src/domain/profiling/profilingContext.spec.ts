import { createRumInternalApi } from '@datadog/browser-rum-core'
import { createSessionManagerMock } from '@datadog/browser-core/test'
import { startProfilingContext } from './profilingContext'

// The profiling context registers an internal API assemble hook: it must contribute
// `_dd.profiling` to view, long task, action and vital events, and nothing to the others.
describe('Profiling Context', () => {
  it('should add the profiling context to the event attributes only for the right event types', () => {
    const internalApi = createRumInternalApi({ sessionManager: createSessionManagerMock() })
    const profilingContextManager = startProfilingContext(internalApi)

    profilingContextManager.set({ status: 'running' })

    const collectedEvents = collectInternalApiEvents(internalApi)

    expect((collectedEvents.view?._dd as { profiling?: unknown } | undefined)?.profiling).toEqual({
      status: 'running',
    })

    for (const eventType of ['error', 'resource'] as const) {
      const dd = collectedEvents[eventType]?._dd as { profiling?: unknown } | undefined
      expect(dd?.profiling).toBeUndefined()
    }

    for (const eventType of ['long_task', 'vital', 'action'] as const) {
      const dd = collectedEvents[eventType]?._dd as { profiling?: unknown } | undefined
      expect(dd?.profiling).toEqual({ status: 'running' })
    }
  })
})

function collectInternalApiEvents(internalApi: ReturnType<typeof createRumInternalApi>) {
  const events: Record<string, Record<string, unknown>> = {}
  const subscription = internalApi.notifications.subscribe((notification) => {
    if (notification.type === 'event_collected') {
      events[notification.event.type] = notification.event
    }
  })

  // A view is needed for child events to be assembled
  internalApi.startEvent({ type: 'view', view: { url: 'x' } }).update({})

  internalApi.addEvent({ baseRumEvent: { type: 'error', error: { message: 'x', source: 'custom' } } })
  internalApi.addEvent({ baseRumEvent: { type: 'resource', resource: { url: 'x', type: 'fetch' } } })
  internalApi.addEvent({ baseRumEvent: { type: 'long_task', long_task: { duration: 100 as never } } })
  internalApi.addEvent({ baseRumEvent: { type: 'vital', vital: { name: 'x', type: 'duration' } } })
  internalApi.addEvent({ baseRumEvent: { type: 'action', action: { type: 'custom' } } })

  subscription.unsubscribe()
  return events
}
