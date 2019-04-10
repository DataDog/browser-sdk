import { expect } from 'chai'
import * as request from 'request'
const baseRequest = request.defaults({ baseUrl: 'http://localhost:3000' })

afterEach(async () => {
  const logs = await browser.getLogs('browser')
  logs.forEach(console.log)
  expect(logs.filter((l: any) => l.level === 'SEVERE')).to.be.empty
})

describe('rum', () => {
  afterEach(async () => {
    expect(await retrieveMonitoringErrors()).to.be.empty
    await resetServerState()
  })

  it('should send display event on load', async () => {
    browser.url('/page.html')
    flushRumEvents()
    const types = await retrieveRumEventsTypes()
    expect(types).to.contain('display')
  })
})

function flushRumEvents() {
  browser.url('/empty.html')
}

function retrieveRumEventsTypes() {
  return fetch('/rum').then((rumEvents: string) => JSON.parse(rumEvents).map((rumEvent: any) => rumEvent.entryType))
}

function retrieveMonitoringErrors() {
  return fetch('/monitoring').then((monitoringErrors: string) => JSON.parse(monitoringErrors))
}

function resetServerState() {
  return fetch('/reset')
}

function fetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    baseRequest.get(url, (err: any, response: any, body: string) => {
      if (err) {
        reject(err)
      }
      resolve(body)
    })
  })
}
