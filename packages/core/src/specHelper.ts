import { Observable } from './observable'
import { RequestDetails } from './requestCollection'
import { noop } from './utils'

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
      ;(promise as FetchStubPromise).rejectWith = async (error: Error) => reject(error) as Promise<Error>
      return promise
    }) as FetchStub
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
        // do nothing
      }
    } as unknown) as PerformanceObserver
  }
}
