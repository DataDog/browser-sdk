import { Configuration } from './configuration'
import { noop } from './utils'

export const SPEC_ENDPOINTS: Partial<Configuration> = {
  internalMonitoringEndpoint: 'https://monitoring-intake.com/abcde?foo=bar',
  logsEndpoint: 'https://logs-intake.com/abcde?foo=bar',
  rumEndpoint: 'https://rum-intake.com/abcde?foo=bar',
  traceEndpoint: 'https://trace-intake.com/abcde?foo=bar',
}

export function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1
}

export function isIE() {
  return navigator.userAgent.indexOf('MSIE ') > 0 || !!navigator.userAgent.match(/Trident.*rv\:11\./)
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
    ;(promise as FetchStubPromise).resolveWith = async (response: ResponseStub) => {
      const resolved = resolve({
        ...response,
        clone: () => {
          const cloned = {
            text: async () => {
              if (response.responseTextError) {
                throw response.responseTextError
              }
              return response.responseText
            },
          }
          return cloned as Response
        },
      }) as Promise<ResponseStub>
      onRequestEnd()
      return resolved
    }
    ;(promise as FetchStubPromise).rejectWith = async (error: Error) => {
      const rejected = reject(error) as Promise<Error>
      onRequestEnd()
      return rejected
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
  resolveWith: (response: ResponseStub) => Promise<ResponseStub>
  rejectWith: (error: Error) => Promise<Error>
}

export class PerformanceObserverStubBuilder {
  public instance: any

  getEntryTypes() {
    // tslint:disable-next-line: no-unsafe-any
    return this.instance.entryTypes
  }

  fakeEntry(entry: PerformanceEntry, entryType: string) {
    const asEntryList = () => [entry]
    // tslint:disable-next-line: no-unsafe-any
    this.instance.callback({
      getEntries: asEntryList,
      getEntriesByName: asEntryList,
      getEntriesByType: (type: string) => {
        if (type === entryType) {
          return asEntryList()
        }
        return []
      },
    })
  }

  getStub(): PerformanceObserver {
    // tslint:disable-next-line:no-this-assignment
    const builder = this
    return (class {
      static supportedEntryTypes = ['navigation']
      constructor(public callback: PerformanceObserverCallback) {
        builder.instance = this
      }
      observe(options?: PerformanceObserverInit) {
        if (options) {
          // tslint:disable-next-line: no-unsafe-any
          builder.instance.entryTypes = options.entryTypes
        }
      }
    } as unknown) as PerformanceObserver
  }
}

export function withXhr({
  setup,
  onComplete,
}: {
  setup: (xhr: XMLHttpRequest) => void
  onComplete: (xhr: XMLHttpRequest) => void
}) {
  const xhr = new XMLHttpRequest()
  xhr.addEventListener('loadend', () => {
    setTimeout(() => {
      onComplete(xhr)
    })
  })
  setup(xhr)
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
