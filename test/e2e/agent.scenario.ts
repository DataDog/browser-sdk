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
})

describe('rum', () => {
  it('should send display event on load', async () => {
    browser.url('/rum-page.html')
    flushEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).to.contain('display')
  })
})
