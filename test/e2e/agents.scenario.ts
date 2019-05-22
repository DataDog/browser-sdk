import { expect } from 'chai'

import { flushEvents, retrieveLogsMessages, retrieveRumEventsTypes, tearDown } from './helpers'

afterEach(tearDown)

describe('logs', () => {
  it('should send logs', async () => {
    browser.url('/agents-page.html')
    browser.execute(() => {
      return (window as any).DD_LOGS.logger.log('hello')
    })
    flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).to.contain('hello')
  })

  it('should track console error', async () => {
    browser.url('/agents-page.html')
    browser.execute(() => {
      return console.error('oh snap') as any
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
    browser.url('/agents-page.html')
    flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).to.contain('page_view')
  })

  it('should track console error', async () => {
    browser.url('/agents-page.html')
    browser.execute(() => {
      return console.error('oh snap') as any
    })
    flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).to.contain('error')
    const browserLogs = await browser.getLogs('browser')
    expect(browserLogs.length).to.equal(1)
  })
})
