import { Configuration } from '../domain/configuration'
import { noop, objectEntries } from './utils'

export const SPEC_ENDPOINTS: Partial<Configuration> = {
  internalMonitoringEndpoint: 'https://monitoring-intake.com/v1/input/abcde?foo=bar',
  logsEndpoint: 'https://logs-intake.com/v1/input/abcde?foo=bar',
  rumEndpoint: 'https://rum-intake.com/v1/input/abcde?foo=bar',
  traceEndpoint: 'https://trace-intake.com/v1/input/abcde?foo=bar',

  isIntakeUrl: (url: string) => {
    const intakeUrls = [
      'https://monitoring-intake.com/v1/input/',
      'https://logs-intake.com/v1/input/',
      'https://rum-intake.com/v1/input/',
      'https://trace-intake.com/v1/input/',
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

export function isIE() {
  const hasIEAgent = /Trident.*rv\:11\./.test(navigator.userAgent)
  return navigator.userAgent.indexOf('MSIE ') > 0 || hasIEAgent
}

export function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/;samesite=strict`)
  })
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
    const promise: unknown = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    ;(promise as FetchStubPromise).resolveWith = (response: ResponseStub) => {
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
    ;(promise as FetchStubPromise).rejectWith = (error: Error) => {
      reject(error)
      onRequestEnd()
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
}

class StubXhr {
  public response: string | undefined = undefined
  public status: number | undefined = undefined
  public readyState: number = XMLHttpRequest.UNSENT
  public onreadystatechange: () => void = noop

  private fakeEventTarget: HTMLDivElement

  constructor() {
    this.fakeEventTarget = document.createElement('div')
  }

  /* eslint-disable @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars */
  open(method: string, url: string) {}
  send() {}
  /* eslint-enable @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars */

  abort() {
    this.status = 0
  }

  complete(status: number, response?: string) {
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

  addEventListener(name: string, callback: () => void) {
    this.fakeEventTarget.addEventListener(name, callback)
  }

  private dispatchEvent(name: string) {
    this.fakeEventTarget.dispatchEvent(createNewEvent(name))
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

  XMLHttpRequest = StubXhr as any

  return {
    reset() {
      XMLHttpRequest = originalXhr
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
  xhr.addEventListener('loadend', () => {
    setTimeout(() => {
      onComplete(xhr)
    })
  })
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
