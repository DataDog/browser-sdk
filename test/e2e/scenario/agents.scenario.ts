import { LogsGlobal } from '@datadog/browser-logs'
import { RumEventCategory, RumResourceEvent, RumViewEvent } from '@datadog/browser-rum'
import {
  browserExecute,
  browserExecuteAsync,
  expectToHaveValidTimings,
  expireSession,
  flushBrowserLogs,
  flushEvents,
  renewSession,
  ServerRumViewEvent,
  sortByMessage,
  tearDown,
  waitServerLogs,
  waitServerRumEvents,
  withBrowserLogs,
} from './helpers'

beforeEach(async () => {
  // tslint:disable-next-line: no-unsafe-any
  await browser.url(`/${(browser as any).config.e2eMode}-e2e-page.html?cb=${Date.now()}`)
})

afterEach(tearDown)

const UNREACHABLE_URL = 'http://localhost:9999/unreachable'

describe('logs', () => {
  it('should send logs', async () => {
    await browserExecute(() => {
      ;((window as any).DD_LOGS as LogsGlobal).logger.log('hello')
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
      ;((window as any).DD_LOGS as LogsGlobal).logger.log('hello')
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
    expect(eventCategories).toContain(RumEventCategory.ERROR)
    await withBrowserLogs((browserLogs) => {
      expect(browserLogs.length).toEqual(1)
    })
  })

  it('should track xhr timings', async () => {
    await browserExecuteAsync((baseUrl, done) => {
      let loaded = false
      const xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => (loaded = true))
      xhr.open('GET', `${baseUrl}/ok`)
      xhr.send()

      const interval = setInterval(() => {
        if (loaded) {
          clearInterval(interval)
          done(undefined)
        }
      }, 500)
    }, browser.options.baseUrl!)

    await flushEvents()
    const timing = (await waitServerRumEvents()).find(
      (event) =>
        event.evt.category === 'resource' && (event as RumResourceEvent).http.url === `${browser.options.baseUrl}/ok`
    ) as RumResourceEvent

    expect(timing as any).not.toBe(undefined)
    expect(timing.http.method).toEqual('GET')
    expect((timing.http as any).status_code).toEqual(200)
    expect(timing.duration).toBeGreaterThan(0)
    expect(timing.http.performance!.download!.start).toBeGreaterThan(0)
  })

  it('should send performance timings along the view events', async () => {
    await flushEvents()
    const events = await waitServerRumEvents()

    const viewEvent = events.find((event) => event.evt.category === 'view') as RumViewEvent

    expect(viewEvent as any).not.toBe(undefined)
    const measures = viewEvent.view.measures
    expect((measures as any).dom_complete).toBeGreaterThan(0)
    expect((measures as any).dom_content_loaded).toBeGreaterThan(0)
    expect((measures as any).dom_interactive).toBeGreaterThan(0)
    expect((measures as any).load_event_end).toBeGreaterThan(0)
  })

  it('should retrieve early requests timings', async () => {
    await flushEvents()
    const events = await waitServerRumEvents()

    const resourceEvent = events.find(
      (event) => event.evt.category === 'resource' && (event as RumResourceEvent).http.url.includes('empty.css')
    ) as RumResourceEvent

    expect(resourceEvent as any).not.toBe(undefined)
    expectToHaveValidTimings(resourceEvent)
  })

  it('should retrieve initial document timings', async () => {
    const pageUrl = await browser.getUrl()
    await flushEvents()
    const events = await waitServerRumEvents()

    const resourceEvent = events.find(
      (event) => event.evt.category === 'resource' && (event as RumResourceEvent).resource.kind === 'document'
    ) as RumResourceEvent

    expect(resourceEvent as any).not.toBe(undefined)
    expect(resourceEvent.http.url).toBe(pageUrl)
    expectToHaveValidTimings(resourceEvent)
  })

  it('should create a new View when the session is renewed', async () => {
    await renewSession()
    await flushEvents()

    const viewEvents = (await waitServerRumEvents()).filter(
      (event) => event.evt.category === 'view'
    ) as ServerRumViewEvent[]

    expect(viewEvents.length).toBe(2)
    expect(viewEvents[0].session_id).not.toBe(viewEvents[1].session_id)
    expect(viewEvents[0].view.id).not.toBe(viewEvents[1].view.id)
  })

  it('should not send events when session is expired', async () => {
    await expireSession()

    await browserExecuteAsync((baseUrl, done) => {
      const xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => done(undefined))
      xhr.open('GET', `${baseUrl}/ok`)
      xhr.send()
    }, browser.options.baseUrl!)

    await flushEvents()

    const timing = (await waitServerRumEvents()).find(
      (event) =>
        event.evt.category === 'resource' && (event as RumResourceEvent).http.url === `${browser.options.baseUrl}/ok`
    ) as RumResourceEvent

    expect(timing).not.toBeDefined()
  })
})

describe('error collection', () => {
  it('should track xhr error', async () => {
    await browserExecuteAsync(
      (baseUrl, unreachableUrl, done) => {
        let count = 0
        let xhr = new XMLHttpRequest()
        xhr.addEventListener('load', () => (count += 1))
        xhr.open('GET', `${baseUrl}/throw`)
        xhr.send()

        xhr = new XMLHttpRequest()
        xhr.addEventListener('load', () => (count += 1))
        xhr.open('GET', `${baseUrl}/unknown`)
        xhr.send()

        xhr = new XMLHttpRequest()
        xhr.addEventListener('error', () => (count += 1))
        xhr.open('GET', unreachableUrl)
        xhr.send()

        xhr = new XMLHttpRequest()
        xhr.addEventListener('load', () => (count += 1))
        xhr.open('GET', `${baseUrl}/ok`)
        xhr.send()

        const interval = setInterval(() => {
          if (count === 4) {
            clearInterval(interval)
            done(undefined)
          }
        }, 500)
      },
      browser.options.baseUrl!,
      UNREACHABLE_URL
    )
    await flushBrowserLogs()
    await flushEvents()
    const logs = (await waitServerLogs()).sort(sortByMessage)

    expect(logs.length).toEqual(2)

    expect(logs[0].message).toEqual(`XHR error GET ${browser.options.baseUrl}/throw`)
    expect(logs[0].http.status_code).toEqual(500)
    expect(logs[0].error.stack).toMatch(/Server error/)

    expect(logs[1].message).toEqual(`XHR error GET ${UNREACHABLE_URL}`)
    expect(logs[1].http.status_code).toEqual(0)
    expect(logs[1].error.stack).toEqual('Failed to load')
  })

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
      browser.options.baseUrl!,
      UNREACHABLE_URL
    )
    await flushBrowserLogs()
    await flushEvents()
    const logs = (await waitServerLogs()).sort(sortByMessage)

    expect(logs.length).toEqual(2)

    expect(logs[0].message).toEqual(`Fetch error GET ${browser.options.baseUrl}/throw`)
    expect(logs[0].http.status_code).toEqual(500)
    expect(logs[0].error.stack).toMatch(/Server error/)

    expect(logs[1].message).toEqual(`Fetch error GET ${UNREACHABLE_URL}`)
    expect(logs[1].http.status_code).toEqual(0)
    expect(logs[1].error.stack).toContain('TypeError')
  })
})
