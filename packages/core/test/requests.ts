import type { EndpointBuilder } from '../src'
import { noop, isServerError } from '../src'
import { createNewEvent } from './emulate/createNewEvent'

export const SPEC_ENDPOINTS = {
  logsEndpointBuilder: stubEndpointBuilder('https://logs-intake.com/v1/input/abcde?foo=bar'),
  rumEndpointBuilder: stubEndpointBuilder('https://rum-intake.com/v1/input/abcde?foo=bar'),

  isIntakeUrl: (url: string) => {
    const intakeUrls = ['https://logs-intake.com/v1/input/', 'https://rum-intake.com/v1/input/']
    return intakeUrls.some((intakeUrl) => url.indexOf(intakeUrl) === 0)
  },
}

export function stubEndpointBuilder(url: string) {
  return { build: (..._: any) => url } as EndpointBuilder
}

export interface Request {
  type: 'xhr' | 'sendBeacon' | 'fetch'
  url: string
  body: string
}

export function interceptRequests() {
  const requests: Request[] = []
  const originalSendBeacon = isSendBeaconSupported() && navigator.sendBeacon.bind(navigator)
  const originalRequest = window.Request
  const originalFetch = window.fetch
  let stubXhrManager: { reset(): void } | undefined

  spyOn(XMLHttpRequest.prototype, 'open').and.callFake((_, url) => requests.push({ type: 'xhr', url } as Request))
  spyOn(XMLHttpRequest.prototype, 'send').and.callFake((body) => (requests[requests.length - 1].body = body as string))
  if (isSendBeaconSupported()) {
    spyOn(navigator, 'sendBeacon').and.callFake((url, body) => {
      requests.push({ type: 'sendBeacon', url: url as string, body: body as string })
      return true
    })
  }
  if (isFetchKeepAliveSupported()) {
    spyOn(window, 'fetch').and.callFake((url, config) => {
      requests.push({ type: 'fetch', url: url as string, body: config!.body as string })
      return new Promise<Response>(() => undefined)
    })
  }

  function isSendBeaconSupported() {
    return !!navigator.sendBeacon
  }

  function isFetchKeepAliveSupported() {
    return 'fetch' in window && 'keepalive' in new window.Request('')
  }

  return {
    requests,
    isSendBeaconSupported,
    isFetchKeepAliveSupported,
    withSendBeacon(newSendBeacon: any) {
      navigator.sendBeacon = newSendBeacon
    },
    withRequest(newRequest: any) {
      window.Request = newRequest
    },
    withFetch(newFetch: any) {
      window.fetch = newFetch
    },
    withStubXhr(onSend: (xhr: StubXhr) => void) {
      stubXhrManager = stubXhr()
      StubXhr.onSend = onSend
    },
    restore() {
      if (originalSendBeacon) {
        navigator.sendBeacon = originalSendBeacon
      }
      if (originalRequest) {
        window.Request = originalRequest
      }
      if (originalFetch) {
        window.fetch = originalFetch
      }
      stubXhrManager?.reset()
      StubXhr.onSend = noop
    },
  }
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
    let resolve: (response: Response) => unknown
    let reject: (error: Error) => unknown
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    }) as unknown as FetchStubPromise
    promise.resolveWith = (responseOptions: ResponseStubOptions) => {
      resolve(new ResponseStub(responseOptions))
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

export interface ResponseStubOptions {
  status?: number
  method?: string
  type?: ResponseType
  responseText?: string
  responseTextError?: Error
  body?: ReadableStream<Uint8Array>
  bodyUsed?: boolean
  bodyDisturbed?: boolean
}

export class ResponseStub implements Response {
  private _body: ReadableStream<Uint8Array> | undefined

  constructor(private options: Readonly<ResponseStubOptions>) {
    if (this.options.bodyUsed) {
      this._body = { locked: true } as any
    } else if (this.options.bodyDisturbed) {
      this._body = { disturbed: true } as any
    } else if (this.options.body) {
      this._body = this.options.body
    } else if (this.options.responseTextError !== undefined) {
      this._body = new ReadableStream({
        start: (controller) => {
          controller.error(this.options.responseTextError)
        },
      })
    } else if (this.options.responseText !== undefined) {
      this._body = new ReadableStream({
        start: (controller) => {
          controller.enqueue(new TextEncoder().encode(this.options.responseText))
          controller.close()
        },
      })
    }
  }

  get status() {
    return this.options.status ?? 200
  }

  get method() {
    return this.options.method ?? 'GET'
  }

  get type() {
    return this.options.type ?? 'basic'
  }

  get bodyUsed() {
    return this._body ? this._body.locked : false
  }

  get bodyDisturbed() {
    return this._body ? !!(this._body as any).disturbed : false
  }

  get body() {
    return this._body || null
  }

  clone() {
    if (this.bodyUsed) {
      throw new TypeError("Failed to execute 'clone' on 'Response': Response body is already used")
    }
    if (this.bodyDisturbed) {
      throw new TypeError('Cannot clone a disturbed Response')
    }
    return new ResponseStub(this.options)
  }

  // Partial implementation, feel free to implement
  /* eslint-disable @typescript-eslint/member-ordering */
  arrayBuffer = notYetImplemented
  text = notYetImplemented
  blob = notYetImplemented
  formData = notYetImplemented
  json = notYetImplemented

  /* eslint-enable @typescript-eslint/member-ordering */
  get ok() {
    return notYetImplemented()
  }

  get headers() {
    return notYetImplemented()
  }

  get redirected() {
    return notYetImplemented()
  }

  get statusText() {
    return notYetImplemented()
  }

  get trailer() {
    return notYetImplemented()
  }

  get url() {
    return notYetImplemented()
  }
}

export type FetchStub = (input: RequestInfo, init?: RequestInit) => FetchStubPromise

export interface FetchStubPromise extends Promise<Response> {
  resolveWith: (response: ResponseStubOptions) => void
  rejectWith: (error: Error) => void
  abort: () => void
}

class StubEventEmitter {
  public listeners: { [k: string]: Array<(event: Event) => void> } = {}

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
    this.listeners[name].forEach((listener) => listener.apply(this, [createNewEvent(name)]))
  }
}

class StubXhr extends StubEventEmitter {
  public static onSend: (xhr: StubXhr) => void | undefined
  public response: string | undefined = undefined
  public status: number | undefined = undefined
  public readyState: number = XMLHttpRequest.UNSENT
  public onreadystatechange: () => void = noop

  private hasEnded = false

  /* eslint-disable @typescript-eslint/no-unused-vars */
  open(method: string | undefined | null, url: string | URL | undefined | null) {
    this.hasEnded = false
  }

  send() {
    StubXhr.onSend?.(this)
  }

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
    if (isServerError(status)) {
      this.dispatchEvent('error')
    }
    this.dispatchEvent('loadend')
  }
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
  setup(xhr as unknown as StubXhr)
}

function notYetImplemented(): never {
  throw new Error('not yet implemented')
}
