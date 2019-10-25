import * as request from 'request'

// TODO use real types
// tslint:disable: no-unsafe-any
type ErrorContext = any
type HttpContext = any
type MonitoringMessage = any
type LogsMessage = any
type RumEvent = any

export interface ServerErrorMessage {
  error: ErrorContext
  http: HttpContext
  message: string
}
export type ServerLogsMessage = LogsMessage & ServerErrorMessage

const baseRequest = request.defaults({ baseUrl: 'http://localhost:3000' })

export async function flushEvents() {
  return browser.url('/empty.html')
}

// typing issue for execute https://github.com/webdriverio/webdriverio/issues/3796
export async function browserExecute(fn: any) {
  return browser.execute(fn as any)
}

export async function browserExecuteAsync(fn: any) {
  return browser.executeAsync(fn as any)
}

export async function tearDown() {
  expect(await retrieveMonitoringErrors()).toEqual([])
  await resetServerState()
  const logs = await browser.getLogs('browser')
  logs.forEach(console.log)
  expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
}

export async function retrieveRumEvents() {
  return fetch('/rum').then((rumEvents: string) => JSON.parse(rumEvents) as RumEvent[])
}

export async function retrieveRumEventsTypes() {
  return retrieveRumEvents().then((rumEvents: RumEvent[]) =>
    rumEvents.map((rumEvent: RumEvent) => rumEvent.evt.category)
  )
}

export async function retrieveLogs() {
  return fetch('/logs').then((logs: string) => JSON.parse(logs) as ServerLogsMessage[])
}

export async function retrieveLogsMessages() {
  return retrieveLogs().then((logs: ServerLogsMessage[]) => logs.map((log: ServerLogsMessage) => log.message))
}

export async function retrieveMonitoringErrors() {
  return fetch('/monitoring').then((monitoringErrors: string) => JSON.parse(monitoringErrors) as MonitoringMessage[])
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
