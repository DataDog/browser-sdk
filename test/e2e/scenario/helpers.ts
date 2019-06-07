import { expect } from 'chai'
import * as request from 'request'
import { LogsMessage } from '../../../src/logs/logger'
import { RumEvent } from '../../../src/rum/rum'

const baseRequest = request.defaults({ baseUrl: 'http://localhost:3000' })

export async function flushEvents() {
  return browser.url('/empty.html')
}

// typing issue for execute https://github.com/webdriverio/webdriverio/issues/3796
export async function browserExecute(fn: any) {
  return browser.execute(fn)
}

export async function browserExecuteAsync(fn: any) {
  return browser.executeAsync(fn)
}

export async function tearDown() {
  expect(await retrieveMonitoringErrors()).to.be.empty
  await resetServerState()
  const logs = await browser.getLogs('browser')
  logs.forEach(console.log)
  expect(logs.filter((l: any) => l.level === 'SEVERE')).to.be.empty
}

export async function retrieveRumEvents() {
  return fetch('/rum').then((rumEvents: string) => JSON.parse(rumEvents))
}

export async function retrieveRumEventsTypes() {
  return retrieveRumEvents().then((rumEvents: RumEvent[]) => rumEvents.map((rumEvent: RumEvent) => rumEvent.type))
}

export async function retrieveLogs() {
  return fetch('/logs').then((logs: string) => JSON.parse(logs))
}

export async function retrieveLogsMessages() {
  return retrieveLogs().then((logs: LogsMessage[]) => logs.map((log: LogsMessage) => log.message))
}

export async function retrieveMonitoringErrors() {
  return fetch('/monitoring').then((monitoringErrors: string) => JSON.parse(monitoringErrors))
}

export async function resetServerState() {
  return fetch('/reset')
}

async function fetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    baseRequest.get(url, (err: any, response: any, body: string) => {
      if (err) {
        reject(err)
      }
      resolve(body)
    })
  })
}

export function sortByMessage(a: { message: string }, b: { message: string }) {
  if (a.message < b.message) {
    return -1
  }
  if (a.message > b.message) {
    return 1
  }
  return 0
}
