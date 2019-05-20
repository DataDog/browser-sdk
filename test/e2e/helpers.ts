import { expect } from 'chai'
import * as request from 'request'

const baseRequest = request.defaults({ baseUrl: 'http://localhost:3000' })

export function flushEvents() {
  browser.url('/empty.html')
}

export async function tearDown() {
  expect(await retrieveMonitoringErrors()).to.be.empty
  await resetServerState()
  const logs = await browser.getLogs('browser')
  logs.forEach(console.log)
  expect(logs.filter((l: any) => l.level === 'SEVERE')).to.be.empty
}

export function retrieveRumEventsTypes() {
  return fetch('/rum').then((rumEvents: string) => JSON.parse(rumEvents).map((rumEvent: any) => rumEvent.entry_type))
}

export function retrieveLogsMessages() {
  return fetch('/logs').then((logs: string) => JSON.parse(logs).map((log: any) => log.message))
}

export function retrieveMonitoringErrors() {
  return fetch('/monitoring').then((monitoringErrors: string) => JSON.parse(monitoringErrors))
}

export function resetServerState() {
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
