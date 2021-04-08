import { DeflateWorker, DeflateWorkerAction, DeflateWorkerListener } from '../src/domain/deflateWorker'
import { Segment } from '../src/types'

// In the mock worker, for simplicity, we'll just encode the string to UTF-8 instead of deflate it.
const encoder = new TextEncoder()

export class MockWorker implements DeflateWorker {
  readonly pendingMessages: DeflateWorkerAction[] = []
  private deflatedData: Uint8Array[] = []
  private listeners: DeflateWorkerListener[] = []

  addEventListener(_: 'message', listener: DeflateWorkerListener): void {
    const index = this.listeners.indexOf(listener)
    if (index < 0) {
      this.listeners.push(listener)
    }
  }

  removeEventListener(_: 'message', listener: DeflateWorkerListener): void {
    const index = this.listeners.indexOf(listener)
    if (index >= 0) {
      this.listeners.splice(index, 1)
    }
  }

  postMessage(message: DeflateWorkerAction): void {
    this.pendingMessages.push(message)
  }

  terminate(): void {
    // do nothing
  }

  get pendingData() {
    return this.pendingMessages.map((message) => message.data || '').join('')
  }

  get listenersCount() {
    return this.listeners.length
  }

  processAllMessages(): void {
    while (this.pendingMessages.length) {
      this.processNextMessage()
    }
  }

  dropNextMessage(): void {
    this.pendingMessages.shift()
  }

  processNextMessage(): void {
    const message = this.pendingMessages.shift()
    if (message) {
      this.deflatedData.push(encoder.encode(message.data))

      switch (message.action) {
        case 'write':
          this.listeners.forEach((listener) =>
            listener({
              data: {
                id: message.id,
                size: uint8ArraysSize(this.deflatedData),
              },
            })
          )
          break
        case 'flush':
          this.listeners.forEach((listener) =>
            listener({
              data: {
                id: message.id,
                result: mergeUint8Arrays(this.deflatedData),
              },
            })
          )
          this.deflatedData.length = 0
      }
    }
  }
}

function uint8ArraysSize(arrays: Uint8Array[]) {
  return arrays.reduce((sum, bytes) => sum + bytes.length, 0)
}

function mergeUint8Arrays(arrays: Uint8Array[]) {
  const result = new Uint8Array(uint8ArraysSize(arrays))
  let offset = 0
  for (const bytes of arrays) {
    result.set(bytes, offset)
    offset += bytes.byteLength
  }
  return result
}

export function parseSegment(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes)) as Segment
}

export function collectAsyncCalls<F extends jasmine.Func>(spy: jasmine.Spy<F>) {
  return {
    waitAsyncCalls: (expectedCallsCount: number, callback: (calls: jasmine.Calls<F>) => void) => {
      if (spy.calls.count() === expectedCallsCount) {
        callback(spy.calls)
      } else {
        spy.and.callFake((() => {
          if (spy.calls.count() === expectedCallsCount) {
            callback(spy.calls)
          }
        }) as F)
      }
    },
    expectNoExtraAsyncCall: (done: () => void) => {
      spy.and.callFake((() => {
        fail('Unexpected extra call')
      }) as F)
      setTimeout(done, 300)
    },
  }
}
