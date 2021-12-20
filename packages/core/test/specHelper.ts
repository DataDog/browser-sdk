import { buildUrl, EndpointBuilder, instrumentMethod } from '@datadog/browser-core'
import { resetNavigationStart } from '../src/tools/timeUtils'
import { noop, objectEntries, assign } from '../src/tools/utils'
import { BrowserWindow } from '../src/transport/eventBridge'

export function stubEndpointBuilder(url: string) {
  return { build: () => url } as EndpointBuilder
}

export const SPEC_ENDPOINTS = {
  internalMonitoringEndpointBuilder: stubEndpointBuilder('https://monitoring-intake.com/v1/input/abcde?foo=bar'),
  logsEndpointBuilder: stubEndpointBuilder('https://logs-intake.com/v1/input/abcde?foo=bar'),
  rumEndpointBuilder: stubEndpointBuilder('https://rum-intake.com/v1/input/abcde?foo=bar'),

  isIntakeUrl: (url: string) => {
    const intakeUrls = [
      'https://monitoring-intake.com/v1/input/',
      'https://logs-intake.com/v1/input/',
      'https://rum-intake.com/v1/input/',
    ]
    return intakeUrls.some((intakeUrl) => url.indexOf(intakeUrl) === 0)
  },
}

export function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1
}

export function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/;samesite=strict`)
  })
}

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

export interface FetchStubManager {
  reset: () => void
  whenAllComplete: (callback: () => void) => void
}

export function stubFetch(): FetchStubManager {
  const originalFetch = window.fetch
  let allFetchCompleteCallback = noop
  let pendingRequests = 0

  function onRequestEnd() {
    pendingRequests -= 1
    if (pendingRequests === 0) {
      setTimeout(() => allFetchCompleteCallback())
    }
  }

  window.fetch = (() => {
    pendingRequests += 1
    let resolve: (response: ResponseStub) => unknown
    let reject: (error: Error) => unknown
    const promise = (new Promise((res, rej) => {
      resolve = res
      reject = rej
    }) as unknown) as FetchStubPromise
    promise.resolveWith = (response: ResponseStub) => {
      resolve({
        ...response,
        clone: () => {
          const cloned = {
            text: () => {
              if (response.responseTextError) {
                return Promise.reject(response.responseTextError)
              }
              return Promise.resolve(response.responseText)
            },
          }
          return cloned as Response
        },
      })
      onRequestEnd()
    }
    promise.rejectWith = (error: Error) => {
      reject(error)
      onRequestEnd()
    }
    promise.abort = () => {
      promise.rejectWith(new DOMException('The user aborted a request', 'AbortError'))
    }

    return promise
  }) as typeof window.fetch

  return {
    whenAllComplete(callback: () => void) {
      allFetchCompleteCallback = callback
    },
    reset() {
      window.fetch = originalFetch
      allFetchCompleteCallback = noop
    },
  }
}

export interface ResponseStub extends Partial<Response> {
  responseText?: string
  responseTextError?: Error
}

export type FetchStub = (input: RequestInfo, init?: RequestInit) => FetchStubPromise

export interface FetchStubPromise extends Promise<Response> {
  resolveWith: (response: ResponseStub) => void
  rejectWith: (error: Error) => void
  abort: () => void
}

class StubEventEmitter {
  public listeners: { [k: string]: Array<() => void> } = {}

  addEventListener(name: string, callback: () => void) {
    if (!this.listeners[name]) {
      this.listeners[name] = []
    }

    this.listeners[name].push(callback)
  }

  removeEventListener(name: string, callback: () => void) {
    if (!this.listeners[name]) {
      throw new Error(`Can't remove a listener. Event "${name}" doesn't exits.`)
    }

    this.listeners[name] = this.listeners[name].filter((listener) => listener !== callback)
  }

  protected dispatchEvent(name: string) {
    if (!this.listeners[name]) {
      return
    }
    this.listeners[name].forEach((listener) => listener.call(this))
  }
}

class StubXhr extends StubEventEmitter {
  public response: string | undefined = undefined
  public status: number | undefined = undefined
  public readyState: number = XMLHttpRequest.UNSENT
  public onreadystatechange: () => void = noop

  private hasEnded = false

  /* eslint-disable @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars */
  open(method: string, url: string) {
    this.hasEnded = false
  }

  send() {}

  abort() {
    this.status = 0
    if (this.hasEnded) {
      // Calling xhr.abort() on an ended request does not trigger events
      return
    }
    this.hasEnded = true
    this.readyState = XMLHttpRequest.DONE
    this.onreadystatechange()
    this.dispatchEvent('abort')
    this.dispatchEvent('loadend')
  }

  complete(status: number, response?: string) {
    if (this.hasEnded) {
      throw new Error("Can't call complete() on a ended request")
    }
    this.hasEnded = true
    this.response = response
    this.status = status
    this.readyState = XMLHttpRequest.DONE

    this.onreadystatechange()

    if (status >= 200 && status < 500) {
      this.dispatchEvent('load')
    }
    if (status >= 500) {
      this.dispatchEvent('error')
    }
    this.dispatchEvent('loadend')
  }
}

export function createNewEvent(eventName: string, properties: { [name: string]: unknown } = {}) {
  let event: Event
  if (typeof Event === 'function') {
    event = new Event(eventName)
  } else {
    event = document.createEvent('Event')
    event.initEvent(eventName, true, true)
  }
  objectEntries(properties).forEach(([name, value]) => {
    // Setting values directly or with a `value` descriptor seems unsupported in IE11
    Object.defineProperty(event, name, {
      get() {
        return value
      },
    })
  })
  return event
}

export function stubXhr() {
  const originalXhr = XMLHttpRequest

  window.XMLHttpRequest = StubXhr as any

  return {
    reset() {
      window.XMLHttpRequest = originalXhr
    },
  }
}

export function withXhr({
  setup,
  onComplete,
}: {
  setup: (xhr: StubXhr) => void
  onComplete: (xhr: XMLHttpRequest) => void
}) {
  const xhr = new XMLHttpRequest()
  const loadend = () => {
    xhr.removeEventListener('loadend', loadend)
    setTimeout(() => {
      onComplete(xhr)
    })
  }
  xhr.addEventListener('loadend', loadend)
  setup((xhr as unknown) as StubXhr)
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

export function initEventBridgeStub(allowedWebViewHosts: string[] = [window.location.hostname]) {
  const eventBridgeStub = {
    send: () => undefined,
    getAllowedWebViewHosts: () => JSON.stringify(allowedWebViewHosts),
  }
  ;(window as BrowserWindow).DatadogEventBridge = eventBridgeStub
  return eventBridgeStub
}

export function deleteEventBridgeStub() {
  delete (window as BrowserWindow).DatadogEventBridge
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
