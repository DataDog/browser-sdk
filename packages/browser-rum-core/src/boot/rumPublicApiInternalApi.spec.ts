import { startSessionManager } from '@datadog/browser-core'
import { relativeNow } from '@datadog/js-core/time'
import {
  createNewEvent,
  createSessionManagerMock,
  interceptRequests,
  mockClock,
  mockEventBridge,
  registerCleanupTask,
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
  // batch. mockClock only freezes timers, not microtasks, so awaiting microtasks is enough.
  // Two hops: the public API resolves the internal API's deferred session manager promise when
  // its session manager resolves, and the internal API attaches it one hop later.
  async function waitForSessionManagerResolution() {
    await Promise.resolve()
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

  it('tracks click actions through the internal API', async () => {
    const clock = mockClock()
    setupSessionManager()
    const { requests, waitForAllFetchCalls } = interceptRequests()

    const button = document.createElement('button')
    button.setAttribute('data-dd-action-name', 'Test Button')
    document.body.appendChild(button)
    registerCleanupTask(() => button.remove())

    const rumPublicApi = makeRumPublicApi(noopRecorderApi, noopProfilerApi)
    rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION }) // automatic views, trackUserInteractions default

    const eventProperties = {
      target: button,
      clientX: 10,
      clientY: 10,
      isPrimary: true,
    }

    button.dispatchEvent(createNewEvent('pointerdown', { ...eventProperties, timeStamp: relativeNow() }))
    clock.tick(80)
    button.dispatchEvent(createNewEvent('pointerup', { ...eventProperties, timeStamp: relativeNow() }))
    // DOM activity after the click, so the click is validated (otherwise it would be discarded)
    button.setAttribute('data-dd-test', 'activity')
    // A child error during the click: the internal API counts it, links it to the click, and the
    // frustration computation flags the click as an error click
    rumPublicApi.addError(new Error('boom'))

    await waitForSessionManagerResolution() // let the MutationObserver microtask deliver
    clock.tick(200) // PAGE_ACTIVITY_END_DELAY: activity ends -> the click stops
    clock.tick(1000) // MAX_DURATION_BETWEEN_CLICKS: the click chain finalizes -> the click is sent

    rumPublicApi.stopSession()
    await waitForAllFetchCalls()

    const events = parseRequestBody(requests)
    const actionEvent = events.find((event) => event.type === 'action')
    const viewEvent = events.find((event) => event.type === 'view')

    expect(actionEvent?.action?.type).toBe('click')
    expect(actionEvent?.action?.target?.name).toBe('Test Button')
    expect(actionEvent?.action?.loading_time).toBeDefined()
    expect(actionEvent?._dd?.action?.name_source).toBeDefined()
    // The click is linked to the active view
    expect(actionEvent?.view?.id).toBe(viewEvent?.view?.id)
    // The child error is counted on the final action event (counts are solely computed by the
    // internal API) and the click is flagged as an error click
    expect(actionEvent?.action?.error?.count).toBe(1)
    expect(actionEvent?.action?.frustration?.type).toContain('error_click')
    const errorEvent = events.find((event) => event.type === 'error')
    expect(errorEvent?.action?.id).toContain(actionEvent?.action?.id)
  })

  it('discards click actions without page activity', async () => {
    const clock = mockClock()
    setupSessionManager()
    const { requests, waitForAllFetchCalls } = interceptRequests()

    const button = document.createElement('button')
    button.setAttribute('data-dd-action-name', 'Dead Button')
    document.body.appendChild(button)
    registerCleanupTask(() => button.remove())

    const rumPublicApi = makeRumPublicApi(noopRecorderApi, noopProfilerApi)
    rumPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION })

    const eventProperties = {
      target: button,
      clientX: 10,
      clientY: 10,
      isPrimary: true,
    }

    button.dispatchEvent(createNewEvent('pointerdown', { ...eventProperties, timeStamp: relativeNow() }))
    clock.tick(80)
    button.dispatchEvent(createNewEvent('pointerup', { ...eventProperties, timeStamp: relativeNow() }))

    await waitForSessionManagerResolution()
    clock.tick(200) // no activity within the validation delay: the click is discarded
    clock.tick(1000) // the click chain finalizes without sending anything

    rumPublicApi.stopSession()
    await waitForAllFetchCalls()

    const events = parseRequestBody(requests)
    expect(events.filter((event) => event.type === 'action')).toEqual([]) // discarded, not sent
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
  return requests[0].body
    .split('\n')
    .filter((line) => !!line)
    .map(
      (line) =>
        JSON.parse(line) as {
          type: string
          view?: { id: string; name: string; is_active: boolean; loading_type: string }
          action?: {
            target?: { name: string }
            type?: string
            loading_time?: number
            id?: string
            error?: { count: number }
            frustration?: { type: string[] }
          }
          error?: { message: string; id?: string; action?: { id?: string[] } }
          _dd?: { document_version: number; action?: { name_source?: string } }
        }
    )
}
