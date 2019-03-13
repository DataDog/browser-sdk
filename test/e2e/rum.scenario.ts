import { expect } from 'chai'
import * as request from 'request'
const baseRequest = request.defaults({ baseUrl: 'http://localhost:3000' })

afterEach(async () => {
  const logs = await browser.getLogs('browser')
  logs.forEach(console.log)
})

describe('rum', () => {
  afterEach(async () => {
    expect(await retrieveMonitoringErrors()).to.be.empty
    await resetServerState()
  })

  it('should send display event on load', async () => {
    browser.url('/page.html')
    flushLogs()
    const logs = await retrieveLogTypes()
    expect(logs).to.contain('display')
  })
})

function flushLogs() {
  browser.url('/empty.html')
}

function retrieveLogTypes() {
  return fetch('/logs').then((logs: string) => JSON.parse(logs).map((log: any) => log.data.entryType))
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
