import * as os from 'os'

// typing issue for execute https://github.com/webdriverio/webdriverio/issues/3796
export async function browserExecute(fn: any) {
  return browser.execute(fn)
}

export async function browserExecuteAsync<R, A, B>(
  fn: (a: A, b: B, done: (result: R) => void) => any,
  a: A,
  b: B
): Promise<R>
export async function browserExecuteAsync<R, A>(fn: (a: A, done: (result: R) => void) => any, arg: A): Promise<R>
export async function browserExecuteAsync<R>(fn: (done: (result: R) => void) => any): Promise<R>
export async function browserExecuteAsync<A extends any[]>(fn: (...params: A) => any, ...args: A) {
  return browser.executeAsync(fn as any, ...args)
}

// To keep tests sane, ensure we got a fixed list of possible platforms and browser names.
const validPlatformNames = ['windows', 'macos', 'linux', 'ios', 'android'] as const
const validBrowserNames = ['edge', 'safari', 'chrome', 'firefox', 'ie'] as const

export function getBrowserName(): typeof validBrowserNames[number] {
  const capabilities = browser.capabilities

  // Look for the browser name in capabilities. It should always be there as long as we don't change
  // the browser capabilities format.
  if (!('browserName' in capabilities) || typeof capabilities.browserName !== 'string') {
    throw new Error("Can't get browser name (no browser name)")
  }
  let browserName = capabilities.browserName.toLowerCase()
  if (browserName === 'msedge') {
    browserName = 'edge'
  }
  if (!includes(validBrowserNames, browserName)) {
    throw new Error(`Can't get browser name (invalid browser name ${browserName})`)
  }

  return browserName
}

export function getPlatformName(): typeof validPlatformNames[number] {
  const capabilities = browser.capabilities

  let platformName: string
  if ('bstack:options' in capabilities && capabilities['bstack:options']) {
    // Look for the platform name in browserstack options. It might not be always there, for example
    // when we run the test locally. This should be adjusted when we are changing the browser
    // capabilities format.
    platformName = (capabilities['bstack:options'] as any).os
  } else {
    // The test is run locally, use the local os name
    platformName = os.type()
  }

  platformName = platformName.toLowerCase()
  if (/^(mac ?os|os ?x|mac ?os ?x|darwin)$/.test(platformName)) {
    platformName = 'macos'
  } else if (platformName === 'windows_nt') {
    platformName = 'windows'
  }
  if (!includes(validPlatformNames, platformName)) {
    throw new Error(`Can't get platform name (invalid platform name ${platformName})`)
  }

  return platformName
}

function includes<T>(list: readonly T[], item: unknown): item is T {
  return list.includes(item as any)
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
    fn(logs)
  }
}

export async function flushBrowserLogs() {
  await withBrowserLogs(() => {
    // Ignore logs
  })
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

export async function sendXhr(url: string, headers: string[][] = []): Promise<string> {
  type State = { state: 'success'; response: string } | { state: 'error' }

  const result: State = await browserExecuteAsync(
    (url, headers, done) => {
      const xhr = new XMLHttpRequest()
      let state: State = { state: 'error' }
      xhr.addEventListener('load', () => {
        state = { state: 'success', response: xhr.response as string }
      })
      xhr.addEventListener('loadend', () => done(state))
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
