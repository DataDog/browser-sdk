import { ErrorContext, HttpContext, MonitoringMessage } from '@browser-sdk/core'
import { LogsMessage } from 'datadog-logs'
import { RumEvent, RumViewEvent } from 'datadog-rum'
import * as request from 'request'

export interface ServerErrorMessage {
  error: ErrorContext
  http: HttpContext
  message: string
  application_id: string
  session_id: string
  view: {
    id: string
  }
}
export type ServerLogsMessage = LogsMessage & ServerErrorMessage

export interface ServerRumViewEvent extends RumViewEvent {
  rum: RumViewEvent['rum'] & {
    document_version: number
  }
  session_id: string
  view: RumViewEvent['view'] & {
    id: string
  }
}

const baseRequest = request.defaults({ baseUrl: 'http://localhost:3000' })

export async function flushEvents() {
  return browser.url('/empty.html')
}

// typing issue for execute https://github.com/webdriverio/webdriverio/issues/3796
export async function browserExecute(fn: any) {
  return browser.execute(fn as any)
}

export async function browserExecuteAsync<R, A, B>(
  fn: (a: A, b: B, done: (result: R) => void) => any,
  a: A,
  b: B
): Promise<R>
export async function browserExecuteAsync<R, A>(fn: (a: A, done: (result: R) => void) => any, arg: A): Promise<R>
export async function browserExecuteAsync<R>(fn: (done: (result: R) => void) => any): Promise<R>
export async function browserExecuteAsync<A extends any[]>(fn: (...args: A) => any, ...args: A) {
  return browser.executeAsync(fn as any, ...args)
}

export async function withBrowserLogs(fn: (logs: object[]) => void) {
  // browser.getLogs is not defined when using a remote webdriver service. We should find an
  // alternative at some point.
  // https://github.com/webdriverio/webdriverio/issues/4275
  if (browser.getLogs) {
    const logs = await browser.getLogs('browser')
    await fn(logs)
  }
}

export async function flushBrowserLogs() {
  await withBrowserLogs(() => {
    // Ignore logs
  })
}

export async function tearDown() {
  expect(await retrieveMonitoringErrors()).toEqual([])
  await resetServerState()
  await withBrowserLogs((logs) => {
    logs.forEach(console.log)
    expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
  })
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

export async function retrieveInitialViewEvents() {
  const events = await retrieveRumEvents()
  return events.filter(
    (event) => event.evt.category === 'view' && (event as ServerRumViewEvent).rum.document_version === 1
  ) as ServerRumViewEvent[]
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

export function findLastEvent(events: RumEvent[], predicate: (event: RumEvent) => boolean) {
  return events.reduce<RumEvent | undefined>((olderEvent, event) => (predicate(event) ? event : olderEvent), undefined)
}

export async function renewSession() {
  // Expire sessionId cookie
  await browser.deleteCookies(['_dd'])
  // Cookies are cached for 1s, wait until the cache expires
  await browser.pause(1100)
  await browser.keys(['f'])
}
