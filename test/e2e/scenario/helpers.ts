import { ErrorContext, HttpContext, MonitoringMessage } from '@datadog/browser-core'
import { LogsMessage } from '@datadog/browser-logs'
import { RumEvent, RumResourceEvent, RumViewEvent } from '@datadog/browser-rum'
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
  // wait to process event loop before switching page
  await browserExecuteAsync((done) =>
    setTimeout(() => {
      done(undefined)
    })
  )
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
  await deleteAllCookies()
}

export async function waitServerLogs(): Promise<ServerLogsMessage[]> {
  return fetchWhile('/logs', (logs: ServerLogsMessage[]) => logs.length === 0)
}

export async function waitServerRumEvents(): Promise<RumEvent[]> {
  return fetchWhile('/rum', (events: RumEvent[]) => events.length === 0)
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

export async function fetchWhile(url: string, conditionFn: (body: any) => boolean, timeout = 10000) {
  const threshold = Date.now() + timeout
  let body: string = await fetch(url)
  while (conditionFn(JSON.parse(body))) {
    if (Date.now() > threshold) {
      throw new Error(`fetchWhile promise rejected because of timeout (${timeout / 1000}s)
            Body: ${body}
            conditionFn: ${conditionFn.toString()}
            `)
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    body = await fetch(url)
  }
  return JSON.parse(body)
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

export async function renewSession() {
  await expireSession()
  const button = await $('button')
  await button.click()
  expect(await findSessionCookie()).toBeDefined()
}

export async function expireSession() {
  await deleteAllCookies()
  expect(await findSessionCookie()).not.toBeDefined()
  // Cookies are cached for 1s, wait until the cache expires
  await browser.pause(1100)
}

// wdio method does not work for some browsers
async function deleteAllCookies() {
  return browserExecute(() => {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf('=')
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT`
    }
  })
}

async function findSessionCookie() {
  const cookies = (await browser.getCookies()) || []
  // tslint:disable-next-line: no-unsafe-any
  return cookies.find((cookie: any) => cookie.name === '_dd')
}

export function expectToHaveValidTimings(resourceEvent: RumResourceEvent) {
  expect((resourceEvent as any).date).toBeGreaterThan(0)
  expect(resourceEvent.duration).toBeGreaterThan(0)
  const performance = resourceEvent.http.performance!
  expect(performance.connect.start).toBeGreaterThanOrEqual(0)
  expect(performance.dns.start).toBeGreaterThanOrEqual(0)
  expect(performance.download.start).toBeGreaterThan(0)
}
