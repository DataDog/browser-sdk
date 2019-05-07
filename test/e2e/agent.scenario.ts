import { expect } from 'chai'

import { flushEvents, retrieveLogsMessages, retrieveRumEventsTypes, tearDown } from './helpers'

afterEach(tearDown)

describe('logs', () => {
  it('should send logs', async () => {
    browser.url('/logs-page.html')
    browser.execute(() => {
      return (window as any).Datadog.logger.log('hello')
    })
    flushEvents()
    const logs = await retrieveLogsMessages()
    expect(logs).to.contain('hello')
  })

  it('should track console error', async () => {
    browser.url('/logs-page.html')
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
  it('should send display event on load', async () => {
    browser.url('/rum-page.html')
    flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).to.contain('display')
  })
})
