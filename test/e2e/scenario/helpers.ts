import { MonitoringMessage } from '@datadog/browser-core'
import * as request from 'request'
// @ts-ignore
import { getCurrentSpec } from '../currentSpecReporter'
import { isRumResourceEvent, ServerLogsMessage, ServerRumEvent, ServerRumResourceEvent } from './serverTypes'

const { hostname } = new URL(browser.config.baseUrl!)

export const serverUrl = {
  crossOrigin: `http://${hostname}:3002`,
  sameOrigin: browser.config.baseUrl!,
}

const intakeRequest = request.defaults({ baseUrl: 'http://localhost:4000' })
let specId: any

export async function startSpec() {
  await generateSpecId()
  await logCurrentSpec()
  await browser.url(`/${browser.config.e2eMode}-e2e-page.html?cb=${Date.now()}&spec-id=${specId}`)
  await waitForSDKLoaded()
}

export async function generateSpecId() {
  specId = String(Math.random()).substring(2)
}

export async function flushEvents() {
  // wait to process user actions + event loop before switching page
  await browserExecuteAsync((done) =>
    setTimeout(() => {
      done(undefined)
    }, 200)
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
  await flushEvents()
  expect(await retrieveMonitoringErrors()).toEqual([])
  await withBrowserLogs((logs) => {
    logs.forEach(console.log)
    expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
  })
  await deleteAllCookies()
  await resetServerState()
}

export async function waitServerLogs(): Promise<ServerLogsMessage[]> {
  return fetchWhile('/logs', (logs: ServerLogsMessage[]) => logs.length === 0)
}

export async function waitServerRumEvents(): Promise<ServerRumEvent[]> {
  return fetchWhile('/rum', (events: ServerRumEvent[]) => events.length === 0)
}

export async function retrieveMonitoringErrors() {
  return fetch('/monitoring').then((monitoringErrors: string) => JSON.parse(monitoringErrors) as MonitoringMessage[])
}

export async function resetServerState() {
  return fetch('/reset')
}

async function fetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    intakeRequest.get(`${url}?spec-id=${specId}`, (err: any, response: any, body: string) => {
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
  return cookies.find((cookie: any) => cookie.name === '_dd_s')
}

export async function makeXHRAndCollectEvent(url: string): Promise<ServerRumResourceEvent | undefined> {
  // tslint:disable-next-line: no-shadowed-variable
  await browserExecuteAsync((url, done) => {
    let loaded = false
    const xhr = new XMLHttpRequest()
    xhr.addEventListener('load', () => (loaded = true))
    xhr.open('GET', url)
    xhr.send()

    const interval = setInterval(() => {
      if (loaded) {
        clearInterval(interval)
        done(undefined)
      }
    }, 500)
  }, url)

  await flushEvents()

  return (await waitServerRumEvents()).filter(isRumResourceEvent).find((event) => event.http.url === url)
}

export function expectToHaveValidTimings(resourceEvent: ServerRumResourceEvent) {
  expect(resourceEvent.date).toBeGreaterThan(0)
  expect(resourceEvent.duration).toBeGreaterThan(0)
  const performance = resourceEvent.http.performance!
  // timing could have been discarded by the SDK if there was not in the correct order
  if (performance) {
    expect(performance.download.start).toBeGreaterThan(0)
  }
}

export async function waitForSDKLoaded() {
  await browserExecuteAsync((done) => {
    const interval = setInterval(() => {
      if (window.DD_RUM && window.DD_LOGS) {
        clearInterval(interval)
        done(undefined)
      }
    }, 500)
  })
}

export async function logCurrentSpec() {
  const message = `${browser.capabilities.browserName} - ${(getCurrentSpec as any)()} - ${specId}`
  return new Promise((resolve, reject) => {
    intakeRequest.post(
      '/server-log',
      {
        body: `\n${message}\n`,
        headers: { 'Content-Type': 'text/plain' },
      },
      (error: unknown) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }
    )
  })
}
