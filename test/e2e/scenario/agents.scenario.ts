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
  tearDown,
  waitForSDKLoaded,
  waitServerLogs,
  waitServerRumEvents,
  withBrowserLogs,
} from './helpers'
import { isRumResourceEvent, isRumUserActionEvent, isRumViewEvent } from './serverTypes'

beforeEach(async () => {
  await browser.url(`/${browser.config.e2eMode}-e2e-page.html?cb=${Date.now()}`)
  await waitForSDKLoaded()
})

afterEach(tearDown)

const UNREACHABLE_URL = 'http://localhost:9999/unreachable'

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
    const timing = (await makeXHRAndCollectEvent(`${serverUrl.sameOrigin}/ok`))!
    expect(timing).not.toBeUndefined()
    expect(timing.http.method).toEqual('GET')
    expect(timing.http.status_code).toEqual(200)
    expectToHaveValidTimings(timing)
  })

  it('should track redirect xhr timings', async () => {
    const timing = (await makeXHRAndCollectEvent(`${serverUrl.sameOrigin}/redirect`))!
    expect(timing).not.toBeUndefined()
    expect(timing.http.method).toEqual('GET')
    expect(timing.http.status_code).toEqual(200)
    expectToHaveValidTimings(timing)
    expect(timing.http.performance!.redirect).not.toBeUndefined()
    expect(timing.http.performance!.redirect!.duration).toBeGreaterThan(0)
  })

  it('should not track disallowed cross origin xhr timings', async () => {
    const timing = (await makeXHRAndCollectEvent(`${serverUrl.crossOrigin}/ok`))!
    expect(timing).not.toBeUndefined()
    expect(timing.http.method).toEqual('GET')
    expect(timing.http.status_code).toEqual(200)
    expect(timing.duration).toBeGreaterThan(0)

    // Edge 18 seems to have valid timings even on cross origin requests ¯\_ツ_/¯ It doesn't matter
    // too much.
    if (browser.capabilities.browserName === 'MicrosoftEdge' && browser.capabilities.browserVersion === '18') {
      expectToHaveValidTimings(timing)
    } else {
      expect(timing.http.performance).toBeUndefined()
    }
  })

  it('should track allowed cross origin xhr timings', async () => {
    const timing = (await makeXHRAndCollectEvent(`${serverUrl.crossOrigin}/ok?timing-allow-origin=true`))!
    expect(timing).not.toBeUndefined()
    expect(timing.http.method).toEqual('GET')
    expect(timing.http.status_code).toEqual(200)
    expectToHaveValidTimings(timing)
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

    expect(viewEvents.length).toBe(2)
    expect(viewEvents[0].session_id).not.toBe(viewEvents[1].session_id)
    expect(viewEvents[0].view.id).not.toBe(viewEvents[1].view.id)
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
    await browserExecute(() => {
      const button = document.querySelector('button')!
      button.addEventListener('click', () => {
        button.setAttribute('data-clicked', 'true')
      })
      button.click()
    })

    await flushEvents()

    const userActionEvents = (await waitServerRumEvents()).filter(isRumUserActionEvent)

    expect(userActionEvents.length).toBe(1)
    expect(userActionEvents[0].user_action).toEqual({
      id: (jasmine.any(String) as unknown) as string,
      type: 'click',
    })
    expect(userActionEvents[0].evt.name).toBe('click me')
    expect(userActionEvents[0].duration).toBeGreaterThanOrEqual(0)
  })

  it('should associate a request to its user action', async () => {
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
      type: 'click',
    })
    expect(userActionEvents[0].evt.name).toBe('click me')
    expect(userActionEvents[0].duration).toBeGreaterThan(0)

    expect(resourceEvents.length).toBe(1)
    expect(resourceEvents[0].user_action!.id).toBe(userActionEvents[0].user_action.id!)
  })
})
