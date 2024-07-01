import { noop } from '../../src'
import { registerCleanupTask } from '../registerCleanupTask'

export type MockFetchManager = ReturnType<typeof mockFetch>

export function mockFetch() {
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
    }) as unknown as MockFetchPromise
    promise.resolveWith = (responseOptions: MockResponseOptions) => {
      resolve(new MockResponse(responseOptions))
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

  registerCleanupTask(() => {
    window.fetch = originalFetch
    allFetchCompleteCallback = noop
  })

  return {
    whenAllComplete(callback: () => void) {
      allFetchCompleteCallback = callback
    },
  }
}

export class MockResponse implements Response {
  private _body: ReadableStream<Uint8Array> | undefined

  constructor(private options: Readonly<MockResponseOptions>) {
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
    return new MockResponse(this.options)
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

export interface MockResponseOptions {
  status?: number
  method?: string
  type?: ResponseType
  responseText?: string
  responseTextError?: Error
  body?: ReadableStream<Uint8Array>
  bodyUsed?: boolean
  bodyDisturbed?: boolean
}
export type MockFetch = (input: RequestInfo, init?: RequestInit) => MockFetchPromise

export interface MockFetchPromise extends Promise<Response> {
  resolveWith: (response: MockResponseOptions) => void
  rejectWith: (error: Error) => void
  abort: () => void
}

function notYetImplemented(): never {
  throw new Error('not yet implemented')
}
