import { DeflateWorker, DeflateWorkerAction, DeflateWorkerListener } from '../src/domain/deflateWorker'

export class MockWorker implements DeflateWorker {
  readonly pendingMessages: DeflateWorkerAction[] = []
  deflatedSize = 0
  private listeners: DeflateWorkerListener[] = []

  get pendingData() {
    return this.pendingMessages.map((message) => message.data || '').join('')
  }

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

  processAll(): void {
    while (this.pendingMessages.length) {
      this.processOne()
    }
  }

  skipOne(): void {
    this.pendingMessages.shift()
  }

  processOne(): void {
    const message = this.pendingMessages.shift()
    if (message) {
      switch (message.action) {
        case 'write':
          this.deflatedSize += message.data.length
          this.listeners.forEach((listener) => listener({ data: { id: message.id, size: this.deflatedSize } }))
          break
        case 'flush':
          if (message.data) {
            this.deflatedSize += message.data.length
          }
          this.listeners.forEach((listener) =>
            listener({ data: { id: message.id, result: new Uint8Array(this.deflatedSize) } })
          )
          this.deflatedSize = 0
      }
    }
  }

  get listenersCount() {
    return this.listeners.length
  }
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
