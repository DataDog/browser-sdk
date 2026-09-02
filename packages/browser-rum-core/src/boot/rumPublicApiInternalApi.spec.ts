import { startSessionManager } from '@datadog/browser-core'
import {
  createSessionManagerMock,
  interceptRequests,
  mockClock,
  mockEventBridge,
  replaceMockableWithSpy,
} from '@datadog/browser-core/test'
import { noopRecorderApi, noopProfilerApi } from '../../test'
import { makeRumPublicApi } from './rumPublicApi'

// PoC phase 2 / 3a validation (see /plan.md): public API calls wired directly to the internal
// API, with views tracked by the trackViews port. The internal API buffering replaces the
// pre-start buffer: public API calls land immediately, and events are assembled and sent once
// the session manager resolves.
//
// Time is controlled with mockClock: view / action boundaries are distinct timestamps, so the
// event hierarchy (which view covers which event) is deterministic — and immune to clock state
// leaked by other specs (ex: the failing rumPublicApi.spec leaves performance.now frozen).
describe('rum public api (internal api PoC)', () => {
  const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

  function setupSessionManager() {
    const startSessionManagerSpy = replaceMockableWithSpy(startSessionManager)
    startSessionManagerSpy.and.returnValue(Promise.resolve(createSessionManagerMock()))
  }

  // Let the session manager promise resolve: the buffered events are assembled and land in the
  // batch. mockClock only freezes timers, not microtasks, so a single await is enough.
  async function waitForSessionManagerResolution() {
    await Promise.resolve()
  }

  it('sends public API events collected before the session manager resolves', async () => {
    const clock = mockClock()
    setupSessionManager()
    const { requests, waitForAllFetchCalls } = interceptRequests()

    const rumPublicApi = makeRumPublicApi(noopRecorderApi, noopProfilerApi)
    rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: true })

    // Called before the session manager promise resolved: events are buffered by the internal API
    rumPublicApi.startView('manual view')
    clock.tick(10)
    rumPublicApi.addAction('click', { foo: 'bar' })
    clock.tick(10)
    rumPublicApi.addError(new Error('boom'))
    clock.tick(10)

    await waitForSessionManagerResolution()
    expect(requests.length).withContext('no flush reason: nothing should be sent yet').toBe(0)

    // Session expiration flushes the batch
    rumPublicApi.stopSession()
    await waitForAllFetchCalls()
    expect(requests.length).toBe(1)

    const events = parseRequestBody(requests)
    const viewEvent = events.find((event) => event.type === 'view')
    const actionEvent = events.find((event) => event.type === 'action')
    const errorEvent = events.find((event) => event.type === 'error')

    expect(viewEvent?.view?.name).toBe('manual view')
    // The action and the error are linked to the view started before them
    expect(actionEvent?.view?.id).toBe(viewEvent?.view?.id)
    expect(errorEvent?.view?.id).toBe(viewEvent?.view?.id)
    expect(actionEvent?.action?.target?.name).toBe('click')
    expect(errorEvent?.error?.message).toBe('boom')
  })

  it('tracks an automatic initial view, updated incrementally, ended on session expiry', async () => {
    const clock = mockClock()
    setupSessionManager()
    const { requests, waitForAllFetchCalls } = interceptRequests()

    const rumPublicApi = makeRumPublicApi(noopRecorderApi, noopProfilerApi)
    rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION }) // automatic views
    clock.tick(10)

    // setViewName triggers an immediate view update (not throttled)
    rumPublicApi.setViewName('renamed view')
    rumPublicApi.addAction('click')
    clock.tick(10)

    await waitForSessionManagerResolution()
    rumPublicApi.stopSession() // session expiry: ends the view and flushes the batch
    await waitForAllFetchCalls()

    const events = parseRequestBody(requests)
    const actionEvent = events.find((event) => event.type === 'action')
    // The batch holds only the latest version of the view (upsert): the final one, with
    // is_active false and the renamed name
    const viewEvents = events.filter((event) => event.type === 'view')
    expect(viewEvents.length).toBe(1)
    expect(viewEvents[0].view?.name).toBe('renamed view')
    expect(viewEvents[0].view?.is_active).toBe(false)
    expect(viewEvents[0].view?.loading_type).toBe('initial_load')
    expect(viewEvents[0]._dd?.document_version).toBeGreaterThanOrEqual(2)
    expect(actionEvent?.view?.id).toBe(viewEvents[0].view?.id)
  })

  it('ends the previous view when startView is called again', async () => {
    const clock = mockClock()
    setupSessionManager()
    const { requests, waitForAllFetchCalls } = interceptRequests()

    const rumPublicApi = makeRumPublicApi(noopRecorderApi, noopProfilerApi)
    rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: true })

    rumPublicApi.startView('first view')
    clock.tick(10)
    rumPublicApi.addAction('first view action')
    clock.tick(10)
    rumPublicApi.startView('second view')
    clock.tick(10)

    await waitForSessionManagerResolution()
    rumPublicApi.stopSession()
    await waitForAllFetchCalls()

    const events = parseRequestBody(requests)
    const firstView = events.find((event) => event.type === 'view' && event.view?.name === 'first view')
    const secondView = events.find((event) => event.type === 'view' && event.view?.name === 'second view')
    const firstViewAction = events.find((event) => event.type === 'action')

    expect(firstView?.view?.is_active).toBe(false)
    expect(secondView?.view?.is_active).toBe(false)
    expect(firstView?.view?.id).not.toBe(secondView?.view?.id)
    // The action collected during the first view is linked to it, not to the second
    expect(firstViewAction?.view?.id).toBe(firstView?.view?.id)
  })

  it('sends events through the event bridge', async () => {
    const clock = mockClock()
    const eventBridge = mockEventBridge()
    const sentEvents: Array<{ type: string }> = []
    eventBridge.send = (msg) => {
      const message = JSON.parse(msg) as { event: { type: string } }
      sentEvents.push(message.event)
    }
    // The event bridge environment uses a stub session manager
    setupSessionManager()

    const rumPublicApi = makeRumPublicApi(noopRecorderApi, noopProfilerApi)
    rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: true })
    rumPublicApi.startView('manual view')
    clock.tick(10)
    rumPublicApi.addAction('click')
    clock.tick(10)

    await waitForSessionManagerResolution()

    expect(sentEvents.map((event) => event.type)).toContain('view')
    expect(sentEvents.map((event) => event.type)).toContain('action')
  })
})

function parseRequestBody(requests: Array<{ body: string }>) {
  return (requests[0].body)
    .split('\n')
    .filter((line) => !!line)
    .map(
      (line) =>
        JSON.parse(line) as {
          type: string
          view?: { id: string; name: string; is_active: boolean; loading_type: string }
          action?: { target?: { name: string } }
          error?: { message: string }
          _dd?: { document_version: number }
        }
    )
}
