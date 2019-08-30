import { LogsGlobal } from '../../../src/logs/logs.entry'
import { RumEvent, RumEventCategory, RumResourceEvent } from '../../../src/rum/rum'

import {
  browserExecute,
  browserExecuteAsync,
  flushEvents,
  retrieveLogs,
  retrieveLogsMessages,
  retrieveRumEvents,
  retrieveRumEventsTypes,
  sortByMessage,
  tearDown,
} from './helpers'

beforeEach(() => {
  browser.url('/agents-page.html')
})

afterEach(tearDown)

describe('logs', () => {
  it('should send logs', async () => {
    await browserExecute(() => {
      ;((window as any).DD_LOGS as LogsGlobal).logger.log('hello')
    })
    await flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).toContain('hello')
  })

  it('should send errors', async () => {
    await browserExecute(() => {
      console.error('oh snap')
    })
    await flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).toContain('console error: oh snap')
    const browserLogs = await browser.getLogs('browser')
    expect(browserLogs.length).toEqual(1)
  })
})

describe('rum', () => {
  it('should send errors', async () => {
    await browserExecute(() => {
      console.error('oh snap')
    })
    await flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).toContain(RumEventCategory.ERROR)
    const browserLogs = await browser.getLogs('browser')
    expect(browserLogs.length).toEqual(1)
  })

  it('should track xhr timings', async () => {
    await browserExecuteAsync((done: () => void) => {
      let loaded = false
      const xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => (loaded = true))
      xhr.open('GET', 'http://localhost:3000/ok')
      xhr.send()

      const interval = setInterval(() => {
        if (loaded) {
          clearInterval(interval)
          done()
        }
      }, 500)
    })

    await flushEvents()
    const timing = (await retrieveRumEvents()).find(
      (event: RumEvent) =>
        event.evt.category === 'resource' && (event as RumResourceEvent).http.url === 'http://localhost:3000/ok'
    ) as RumResourceEvent

    expect(timing.http.method).toEqual('GET')
    expect((timing.http as any).status_code).toEqual(200)
    expect(timing.duration).toBeGreaterThan(0)
    expect(timing.http.performance!.download.start).toBeGreaterThan(0)
    expect(timing.http.performance!.download.duration).toBeGreaterThan(0)
  })
})

describe('error collection', () => {
  it('should track xhr error', async () => {
    await browserExecuteAsync((done: () => void) => {
      let count = 0
      let xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => (count += 1))
      xhr.open('GET', 'http://localhost:3000/throw')
      xhr.send()

      xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => (count += 1))
      xhr.open('GET', 'http://localhost:3000/unknown')
      xhr.send()

      xhr = new XMLHttpRequest()
      xhr.addEventListener('error', () => (count += 1))
      xhr.open('GET', 'http://localhost:9999/unreachable')
      xhr.send()

      xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => (count += 1))
      xhr.open('GET', 'http://localhost:3000/ok')
      xhr.send()

      const interval = setInterval(() => {
        if (count === 4) {
          clearInterval(interval)
          done()
        }
      }, 500)
    })
    await browser.getLogs('browser')
    await flushEvents()
    const logs = (await retrieveLogs()).sort(sortByMessage)

    expect(logs.length).toEqual(2)

    expect(logs[0].message).toEqual('XHR error GET http://localhost:3000/throw')
    expect(logs[0].http.status_code).toEqual(500)
    expect(logs[0].error.stack).toMatch(/Server error/)

    expect(logs[1].message).toEqual('XHR error GET http://localhost:9999/unreachable')
    expect(logs[1].http.status_code).toEqual(0)
    expect(logs[1].error.stack).toEqual('Failed to load')
  })

  it('should track fetch error', async () => {
    await browserExecuteAsync((done: () => void) => {
      let count = 0
      fetch('http://localhost:3000/throw').then(() => (count += 1))
      fetch('http://localhost:3000/unknown').then(() => (count += 1))
      fetch('http://localhost:9999/unreachable').catch(() => (count += 1))
      fetch('http://localhost:3000/ok').then(() => (count += 1))

      const interval = setInterval(() => {
        if (count === 4) {
          clearInterval(interval)
          done()
        }
      }, 500)
    })
    await browser.getLogs('browser')
    await flushEvents()
    const logs = (await retrieveLogs()).sort(sortByMessage)

    expect(logs.length).toEqual(2)

    expect(logs[0].message).toEqual('Fetch error GET http://localhost:3000/throw')
    expect(logs[0].http.status_code).toEqual(500)
    expect(logs[0].error.stack).toMatch(/Server error/)

    expect(logs[1].message).toEqual('Fetch error GET http://localhost:9999/unreachable')
    expect(logs[1].http.status_code).toEqual(0)
    expect(logs[1].error.stack).toEqual('TypeError: Failed to fetch')
  })
})
