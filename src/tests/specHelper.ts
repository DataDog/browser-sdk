import { ErrorMessage } from '../core/errorCollection'
import { Observable } from '../core/observable'
import { noop } from '../core/utils'

export function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

export function isIE(version: number) {
  const ua = navigator.userAgent.toLowerCase()
  return ua.indexOf('msie') !== -1 && parseInt(ua.split('msie')[1], 10) === version
}

export function isAndroid() {
  return /android/i.test(navigator.userAgent)
}

export function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`)
  })
}

export class FetchStubBuilder {
  private messages: ErrorMessage[] = []
  private pendingFetch = 0
  private whenAllCompleteFn: (messages: ErrorMessage[]) => void = noop

  constructor(observable: Observable<ErrorMessage>) {
    observable.subscribe((message: ErrorMessage) => {
      this.messages.push(message)
      this.pendingFetch -= 1
      if (this.pendingFetch === 0) {
        // ensure that AssertionError are not swallowed by promise context
        setTimeout(() => {
          this.whenAllCompleteFn(this.messages)
        })
      }
    })
  }

  whenAllComplete(onCompleteFn: (messages: ErrorMessage[]) => void) {
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
