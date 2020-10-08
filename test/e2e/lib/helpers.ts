import { getTestServers } from './servers'

export async function flushEvents() {
  // wait to process user actions + event loop before switching page
  await browserExecuteAsync((done) =>
    setTimeout(() => {
      done(undefined)
    }, 200)
  )
  await waitForIdle()
  const servers = await getTestServers()
  await browser.url(`${servers.base.url}/empty`)
  await waitForIdle()
}

export async function waitForIdle() {
  const servers = await getTestServers()
  return Promise.all([servers.base.waitForIdle(), servers.crossOrigin.waitForIdle(), servers.intake.waitForIdle()])
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

interface BrowserLog {
  level: string
  message: string
  source: string
  timestamp: number
}

export async function withBrowserLogs(fn: (logs: BrowserLog[]) => void) {
  // browser.getLogs is not defined when using a remote webdriver service. We should find an
  // alternative at some point.
  // https://github.com/webdriverio/webdriverio/issues/4275
  if (browser.getLogs) {
    const logs = (await browser.getLogs('browser')) as BrowserLog[]
    await fn(logs)
  }
}

export async function flushBrowserLogs() {
  await withBrowserLogs(() => {
    // Ignore logs
  })
}

export async function renewSession() {
  await expireSession()
  const documentElement = await $('html')
  await documentElement.click()
  expect(await findSessionCookie()).toBeDefined()
}

export async function expireSession() {
  await deleteAllCookies()
  expect(await findSessionCookie()).not.toBeDefined()
  // Cookies are cached for 1s, wait until the cache expires
  await browser.pause(1100)
}

// wdio method does not work for some browsers
export async function deleteAllCookies() {
  return browserExecute(() => {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf('=')
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;samesite=strict`
    }
  })
}

async function findSessionCookie() {
  const cookies = (await browser.getCookies()) || []
  // tslint:disable-next-line: no-unsafe-any
  return cookies.find((cookie: any) => cookie.name === '_dd_s')
}

export async function sendXhr(url: string, headers: string[][] = []): Promise<string> {
  type State = { state: 'success'; response: string } | { state: 'error' }

  const result: State = await browserExecuteAsync(
    // tslint:disable-next-line: no-shadowed-variable
    (url, headers, done) => {
      const xhr = new XMLHttpRequest()
      xhr.addEventListener('load', () => done({ state: 'success', response: xhr.response as string }))
      xhr.addEventListener('error', () => done({ state: 'error' }))
      xhr.open('GET', url)
      headers.forEach((header) => xhr.setRequestHeader(header[0], header[1]))
      xhr.send()
    },
    url,
    headers
  )

  if (result.state === 'error') {
    throw new Error(`sendXhr: request to ${url} failed`)
  }
  return result.response
}

export async function sendFetch(url: string, headers: string[][] = []): Promise<string> {
  return browserExecuteAsync(
    // tslint:disable-next-line: no-shadowed-variable
    (url, headers, done) => {
      window
        .fetch(url, { headers })
        .then((response) => response.text())
        .then(done)
    },
    url,
    headers
  )
}
