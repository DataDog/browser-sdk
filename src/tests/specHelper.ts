import { Observable } from '../core/observable'
import { RequestDetails } from '../core/requestCollection'
import { noop } from '../core/utils'

export function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1
}

export function isIE(version: number) {
  const ua = navigator.userAgent.toLowerCase()
  return ua.indexOf('msie') !== -1 && parseInt(ua.split('msie')[1], 10) === version
}

export function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`)
  })
}

export class FetchStubBuilder {
  private requests: RequestDetails[] = []
  private pendingFetch = 0
  private whenAllCompleteFn: (messages: RequestDetails[]) => void = noop

  constructor(observable: Observable<RequestDetails>) {
    observable.subscribe((request: RequestDetails) => {
      this.requests.push(request)
      this.pendingFetch -= 1
      if (this.pendingFetch === 0) {
        // ensure that AssertionError are not swallowed by promise context
        setTimeout(() => {
          this.whenAllCompleteFn(this.requests)
        })
      }
    })
  }

  whenAllComplete(onCompleteFn: (_: RequestDetails[]) => void) {
    this.whenAllCompleteFn = onCompleteFn
  }

  getStub() {
    return (() => {
      this.pendingFetch += 1
      let resolve: (response: ResponseStub) => unknown
      let reject: (error: Error) => unknown
      const promise: unknown = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      ;(promise as FetchStubPromise).resolveWith = async (response: ResponseStub) =>
        resolve({
          ...response,
          clone: () => {
            const cloned = { text: async () => response.responseText }
            return cloned as Response
          },
        }) as Promise<ResponseStub>
      ;(promise as FetchStubPromise).rejectWith = async (error: Error) => reject(error) as Promise<Error>
      return promise
    }) as FetchStub
  }
}

export interface ResponseStub extends Partial<Response> {
  responseText?: string
}

export type FetchStub = (input: RequestInfo, init?: RequestInit) => FetchStubPromise

export interface FetchStubPromise extends Promise<Response> {
  resolveWith: (response: ResponseStub) => Promise<ResponseStub>
  rejectWith: (error: Error) => Promise<Error>
}

export class PerformanceObserverStubBuilder {
  public instance: any

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
      constructor(public callback: PerformanceObserverCallback) {
        builder.instance = this
      }
      observe(options?: PerformanceObserverInit) {
        // do nothing
      }
    } as unknown) as PerformanceObserver
  }
}
