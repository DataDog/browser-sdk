import { expect } from 'chai'

import {
  browserExecute,
  flushEvents,
  retrieveLogsMessages,
  retrieveRumEvents,
  retrieveRumEventsTypes,
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

  it('should track console error', async () => {
    browserExecute(() => {
      console.error('oh snap')
    })
    flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).to.contain('oh snap')
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
      .filter((rumEvent: any) => rumEvent.entry_type === 'page_view')
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

  it('should track console error', async () => {
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
