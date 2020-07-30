import './globalTypes'
import {
  browserExecute,
  browserExecuteAsync,
  expectToHaveValidTimings,
  expireSession,
  flushBrowserLogs,
  flushEvents,
  makeXHRAndCollectEvent,
  renewSession,
  serverUrl,
  sortByMessage,
  startSpec,
  tearDown,
  waitServerLogs,
  waitServerRumEvents,
  withBrowserLogs,
} from './helpers'
import { isRumResourceEvent, isRumUserActionEvent, isRumViewEvent, ServerRumViewLoadingType } from './serverTypes'

beforeEach(startSpec)

afterEach(tearDown)

const UNREACHABLE_URL = 'http://localhost:9999/unreachable'
const REQUEST_DURATION = 500

describe('logs', () => {
  it('should send logs', async () => {
    await browserExecute(() => {
      window.DD_LOGS!.logger.log('hello')
    })
    await flushEvents()
    const logMessages = (await waitServerLogs()).map((log) => log.message)
    expect(logMessages).toContain('hello')
  })

  it('should send errors', async () => {
    await browserExecute(() => {
      console.error('oh snap')
    })
    await flushEvents()
    const logMessages = (await waitServerLogs()).map((log) => log.message)
    expect(logMessages).toContain('console error: oh snap')
    await withBrowserLogs((browserLogs) => {
      expect(browserLogs.length).toEqual(1)
    })
  })

  it('should add RUM internal context to logs', async () => {
    await browserExecute(() => {
      window.DD_LOGS!.logger.log('hello')
    })
    await flushEvents()
    const log = (await waitServerLogs())[0]
    expect(log.application_id).toBe('rum')
    expect(log.view.id).toBeDefined()
  })
})

describe('rum', () => {
  it('should send errors', async () => {
    await browserExecute(() => {
      console.error('oh snap')
    })
    await flushEvents()
    const eventCategories = (await waitServerRumEvents()).map((rumEvent) => rumEvent.evt.category)
    expect(eventCategories).toContain('error')
    await withBrowserLogs((browserLogs) => {
      expect(browserLogs.length).toEqual(1)
    })
  })

  it('should track xhr timings', async () => {
    const timing = (await makeXHRAndCollectEvent(`${serverUrl.sameOrigin}/ok?duration=${REQUEST_DURATION}`))!
    expect(timing).not.toBeUndefined()
    expect(timing.http.method).toEqual('GET')
    expect(timing.http.status_code).toEqual(200)
    expectToHaveValidTimings(timing)
  })

  it('should track redirect xhr timings', async () => {
    const timing = (await makeXHRAndCollectEvent(`${serverUrl.sameOrigin}/redirect?duration=${REQUEST_DURATION}`))!
    expect(timing).not.toBeUndefined()
    expect(timing.http.method).toEqual('GET')
    expect(timing.http.status_code).toEqual(200)
    expectToHaveValidTimings(timing)
    expect(timing.http.performance!.redirect).not.toBeUndefined()
    expect(timing.http.performance!.redirect!.duration).toBeGreaterThan(0)
  })

  it('should not track disallowed cross origin xhr timings', async () => {
    if (browser.capabilities.browserName === 'MicrosoftEdge') {
      pending('Edge 18 seems to track cross origin xhr timings anyway')
    }
    const resourceEvent = (await makeXHRAndCollectEvent(`${serverUrl.crossOrigin}/ok?duration=${REQUEST_DURATION}`))!
    expect(resourceEvent).not.toBeUndefined()
    expect(resourceEvent.http.method).toEqual('GET')
    expect(resourceEvent.http.status_code).toEqual(200)
    expect(resourceEvent.duration).toBeGreaterThan(0)
    expect(resourceEvent.http.performance).toBeUndefined()
  })

  it('should track allowed cross origin xhr timings', async () => {
    const resourceEvent = (await makeXHRAndCollectEvent(
      `${serverUrl.crossOrigin}/ok?timing-allow-origin=true&duration=${REQUEST_DURATION}`
    ))!
    expect(resourceEvent).not.toBeUndefined()
    expect(resourceEvent.http.method).toEqual('GET')
    expect(resourceEvent.http.status_code).toEqual(200)
    expectToHaveValidTimings(resourceEvent)
  })

  it('should send performance timings along the view events', async () => {
    await flushEvents()
    const events = await waitServerRumEvents()

    const viewEvent = events.find(isRumViewEvent)

    expect(viewEvent).not.toBe(undefined)
    const measures = viewEvent!.view.measures!
    expect(measures.dom_complete).toBeGreaterThan(0)
    expect(measures.dom_content_loaded).toBeGreaterThan(0)
    expect(measures.dom_interactive).toBeGreaterThan(0)
    expect(measures.load_event_end).toBeGreaterThan(0)
  })

  it('should retrieve early requests timings', async () => {
    await flushEvents()
    const events = await waitServerRumEvents()

    const resourceEvent = events.filter(isRumResourceEvent).find((event) => event.http.url.includes('empty.css'))

    expect(resourceEvent).not.toBe(undefined)
    expectToHaveValidTimings(resourceEvent!)
  })

  it('should retrieve initial document timings', async () => {
    const pageUrl = await browser.getUrl()
    await flushEvents()
    const events = await waitServerRumEvents()

    const resourceEvent = events.filter(isRumResourceEvent).find((event) => event.resource.kind === 'document')

    expect(resourceEvent).not.toBe(undefined)
    expect(resourceEvent!.http.url).toBe(pageUrl)
    expectToHaveValidTimings(resourceEvent!)
  })

  it('should create a new View when the session is renewed', async () => {
    await renewSession()
    await flushEvents()

    const viewEvents = (await waitServerRumEvents()).filter(isRumViewEvent)

    const firstViewEvent = viewEvents[0]
    const lastViewEvent = viewEvents[viewEvents.length - 1]
    expect(firstViewEvent.session_id).not.toBe(lastViewEvent.session_id)
    expect(firstViewEvent.view.id).not.toBe(lastViewEvent.view.id)

    const distinctIds = new Set(viewEvents.map((viewEvent) => viewEvent.view.id))
    expect(distinctIds.size).toBe(2)
  })

  it('should not send events when session is expired', async () => {
    await expireSession()

    const timing = await makeXHRAndCollectEvent(`${serverUrl.sameOrigin}/ok`)

    expect(timing).not.toBeDefined()
  })
})

describe('error collection', () => {
  it('should track fetch error', async () => {
    await browserExecuteAsync(
      (baseUrl, unreachableUrl, done) => {
        let count = 0
        fetch(`${baseUrl}/throw`).then(() => (count += 1))
        fetch(`${baseUrl}/unknown`).then(() => (count += 1))
        fetch(unreachableUrl).catch(() => (count += 1))
        fetch(`${baseUrl}/ok`).then(() => (count += 1))

        const interval = setInterval(() => {
          if (count === 4) {
            clearInterval(interval)
            done(undefined)
          }
        }, 500)
      },
      serverUrl.sameOrigin,
      UNREACHABLE_URL
    )
    await flushBrowserLogs()
    await flushEvents()
    const logs = (await waitServerLogs()).sort(sortByMessage)

    expect(logs.length).toEqual(2)

    expect(logs[0].message).toEqual(`Fetch error GET ${serverUrl.sameOrigin}/throw`)
    expect(logs[0].http!.status_code).toEqual(500)
    expect(logs[0].error!.stack).toMatch(/Server error/)

    expect(logs[1].message).toEqual(`Fetch error GET ${UNREACHABLE_URL}`)
    expect(logs[1].http!.status_code).toEqual(0)
    expect(logs[1].error!.stack).toContain('TypeError')
  })
})

describe('user action collection', () => {
  it('should track a click user action', async () => {
    const button = await $('button')
    await browserExecute(() => {
      const btn = document.querySelector('button')!
      btn.addEventListener('click', () => {
        btn.setAttribute('data-clicked', 'true')
      })
      btn.click()
    })
    expect(await button.getAttribute('data-clicked')).toBe('true')

    await flushEvents()

    const userActionEvents = (await waitServerRumEvents()).filter(isRumUserActionEvent)

    expect(userActionEvents.length).toBe(1)
    expect(userActionEvents[0].user_action).toEqual({
      id: (jasmine.any(String) as unknown) as string,
      measures: {
        error_count: 0,
        long_task_count: (jasmine.any(Number) as unknown) as number,
        resource_count: 0,
      },
      type: 'click',
    })
    expect(userActionEvents[0].evt.name).toBe('click me')
    expect(userActionEvents[0].duration).toBeGreaterThanOrEqual(0)
  })

  it('should associate a request to its user action', async () => {
    await $('button')
    await browserExecuteAsync((baseUrl, done) => {
      const button = document.querySelector('button')!
      button.addEventListener('click', () => {
        fetch(`${baseUrl}/ok`).then(done)
      })
      button.click()
    }, serverUrl.sameOrigin)

    await flushEvents()

    const rumEvents = await waitServerRumEvents()
    const userActionEvents = rumEvents.filter(isRumUserActionEvent)
    const resourceEvents = rumEvents.filter(isRumResourceEvent).filter((event) => event.resource.kind === 'fetch')

    expect(userActionEvents.length).toBe(1)
    expect(userActionEvents[0].user_action).toEqual({
      id: (jasmine.any(String) as unknown) as string,
      measures: {
        error_count: 0,
        long_task_count: (jasmine.any(Number) as unknown) as number,
        resource_count: 1,
      },
      type: 'click',
    })
    expect(userActionEvents[0].evt.name).toBe('click me')
    expect(userActionEvents[0].duration).toBeGreaterThan(0)

    expect(resourceEvents.length).toBe(1)
    expect(resourceEvents[0].user_action!.id).toBe(userActionEvents[0].user_action.id!)
  })
})

describe('anchor navigation', () => {
  it('should not create a new view when it is an Anchor navigation', async () => {
    await $('#test-anchor').click()

    await flushEvents()
    const rumEvents = await waitServerRumEvents()
    const viewEvents = rumEvents.filter(isRumViewEvent)

    expect(viewEvents.length).toBe(1)
    expect(viewEvents[0].view.loading_type).toBe(ServerRumViewLoadingType.INITIAL_LOAD)
  })

  it('should create a new view on hash change', async () => {
    await browserExecute(() => {
      window.location.hash = '#bar'
    })

    await flushEvents()
    const rumEvents = await waitServerRumEvents()
    const viewEvents = rumEvents.filter(isRumViewEvent)

    expect(viewEvents.length).toBe(2)
    expect(viewEvents[0].view.loading_type).toBe(ServerRumViewLoadingType.INITIAL_LOAD)
    expect(viewEvents[1].view.loading_type).toBe(ServerRumViewLoadingType.ROUTE_CHANGE)
  })
})
