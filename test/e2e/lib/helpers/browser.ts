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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

interface VisualViewportData {
  scale: number
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
  pageLeft: number
  pageTop: number
}

export function getVisualViewport(): Promise<VisualViewportData> {
  return browserExecute(() => {
    const visual = window.visualViewport || {}
    return {
      scale: visual.scale,
      width: visual.width,
      height: visual.height,
      offsetLeft: visual.offsetLeft,
      offsetTop: visual.offsetTop,
      pageLeft: visual.pageLeft,
      pageTop: visual.pageTop,
    }
  }) as Promise<VisualViewportData>
}

export function getWindowScroll() {
  return browserExecute(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  })) as Promise<{ scrollX: number; scrollY: number }>
}
