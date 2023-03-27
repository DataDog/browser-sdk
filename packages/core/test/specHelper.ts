import { instrumentMethod } from '../src/tools/instrumentMethod'
import { resetNavigationStart } from '../src/tools/timeUtils'
import { buildUrl } from '../src/tools/urlPolyfill'
import { noop, assign } from '../src/tools/utils'
import type { BrowserWindowWithEventBridge } from '../src/transport'

export type Clock = ReturnType<typeof mockClock>

export function mockClock(date?: Date) {
  jasmine.clock().install()
  jasmine.clock().mockDate(date)
  const start = Date.now()
  spyOn(performance, 'now').and.callFake(() => Date.now() - start)
  spyOnProperty(performance.timing, 'navigationStart', 'get').and.callFake(() => start)
  resetNavigationStart()
  return {
    tick: (ms: number) => jasmine.clock().tick(ms),
    setDate: (date: Date) => jasmine.clock().mockDate(date),
    cleanup: () => {
      jasmine.clock().uninstall()
      resetNavigationStart()
    },
  }
}

export function mockLocation(initialUrl: string) {
  const fakeLocation = buildLocation(initialUrl)
  spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
    assign(fakeLocation, buildLocation(pathname, fakeLocation.href))
  })

  function hashchangeCallBack() {
    fakeLocation.hash = window.location.hash
    fakeLocation.href = fakeLocation.href.replace(/#.*/, '') + window.location.hash
  }

  window.addEventListener('hashchange', hashchangeCallBack)
  return {
    location: fakeLocation,
    cleanup: () => {
      window.removeEventListener('hashchange', hashchangeCallBack)
      window.location.hash = ''
    },
  }
}

export function buildLocation(url: string, base = location.href) {
  const urlObject = buildUrl(url, base)
  return {
    hash: urlObject.hash,
    href: urlObject.href,
    pathname: urlObject.pathname,
    search: urlObject.search,
  } as Location
}

export function setPageVisibility(visibility: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    get() {
      return visibility
    },
    configurable: true,
  })
}

export function restorePageVisibility() {
  delete (document as any).visibilityState
}

export function setNavigatorOnLine(onLine: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    get() {
      return onLine
    },
    configurable: true,
  })
}

export function restoreNavigatorOnLine() {
  delete (navigator as any).onLine
}

export function initEventBridgeStub(allowedWebViewHosts: string[] = [window.location.hostname]) {
  const eventBridgeStub = {
    send: (msg: string) => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
  }
  ;(window as BrowserWindowWithEventBridge).DatadogEventBridge = eventBridgeStub
  return eventBridgeStub
}

export function deleteEventBridgeStub() {
  delete (window as BrowserWindowWithEventBridge).DatadogEventBridge
}

/**
 * Opt out of jasmine uncaught error interception during test. This is useful for tests that are
 * instrumenting `window.onerror`. See https://github.com/jasmine/jasmine/pull/1860 for more
 * information.
 */
export function disableJasmineUncaughtErrorHandler() {
  const { stop } = instrumentMethod(window, 'onerror', () => noop)
  return {
    reset: stop,
  }
}

export function stubCookie() {
  let cookie = ''
  return {
    getSpy: spyOnProperty(Document.prototype, 'cookie', 'get').and.callFake(() => cookie),
    setSpy: spyOnProperty(Document.prototype, 'cookie', 'set').and.callFake((newCookie) => {
      cookie = newCookie
    }),
    currentValue: () => cookie,
    setCurrentValue: (newCookie: string) => {
      cookie = newCookie
    },
  }
}
