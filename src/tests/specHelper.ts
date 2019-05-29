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
      let resolve: (response: ResponseStub) => void
      let reject: (error: Error) => void
      const promise: any = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      promise.resolveWith = (response: ResponseStub) =>
        resolve({
          ...response,
          clone: () => {
            const cloned = { text: async () => response.responseText }
            return cloned as Response
          },
        })
      promise.rejectWith = (error: Error) => reject(error)
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
