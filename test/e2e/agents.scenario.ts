import { expect } from 'chai'

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
    browserExecute(() => {
      ;(window as any).DD_LOGS.logger.log('hello')
    })
    flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).to.contain('hello')
  })

  it('should send errors', async () => {
    browserExecute(() => {
      console.error('oh snap')
    })
    flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).to.contain('console error: oh snap')
    const browserLogs = await browser.getLogs('browser')
    expect(browserLogs.length).to.equal(1)
  })
})

describe('rum', () => {
  it('should send page view event on load', async () => {
    flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).to.contain('page_view')
  })

  it('should send page views during history navigation', async () => {
    browserExecute(() => {
      history.pushState({}, '', '/')

      history.pushState({}, '', '/#push-hash')
      history.pushState({}, '', '/?push-query')
      history.pushState({}, '', '/push-path')

      history.pushState({}, '', '/')

      history.replaceState({}, '', '/#replace-hash')
      history.replaceState({}, '', '/?replace-query')
      history.replaceState({}, '', '/replace-path')

      history.pushState({}, '', '/')

      history.back()
      history.forward()
    })

    flushEvents()
    const trackedUrls = (await retrieveRumEvents())
      .filter((rumEvent: any) => rumEvent.type === 'page_view')
      .map((rumEvent: any) => rumEvent.http.referer.replace('http://localhost:3000', ''))

    expect(trackedUrls).to.deep.equal([
      '/agents-page.html',
      '/',
      '/push-path',
      '/',
      '/replace-path',
      '/',
      '/replace-path',
    ])
  })

  it('should send errors', async () => {
    browserExecute(() => {
      console.error('oh snap')
    })
    flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).to.contain('error')
    const browserLogs = await browser.getLogs('browser')
    expect(browserLogs.length).to.equal(1)
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
    const logs = ((await retrieveLogs()) as any[]).sort(sortByMessage)

    expect(logs.length).equal(2)

    expect(logs[0].message).to.equal('XHR error GET http://localhost:3000/throw')
    expect(logs[0].http.status_code).to.equal(500)
    expect(logs[0].error.stack).to.match(/Server error/)

    expect(logs[1].message).to.equal('XHR error GET http://localhost:9999/unreachable')
    expect(logs[1].http.status_code).to.equal(0)
    expect(logs[1].error.stack).to.equal('Failed to load')
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
    const logs = ((await retrieveLogs()) as any[]).sort(sortByMessage)

    expect(logs.length).equal(2)

    expect(logs[0].message).to.equal('Fetch error GET http://localhost:3000/throw')
    expect(logs[0].http.status_code).to.equal(500)
    expect(logs[0].error.stack).to.match(/Server error/)

    expect(logs[1].message).to.equal('Fetch error GET http://localhost:9999/unreachable')
    expect(logs[1].http.status_code).to.equal(0)
    expect(logs[1].error.stack).to.equal('TypeError: Failed to fetch')
  })
})
