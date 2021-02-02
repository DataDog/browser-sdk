import { DeflateWorker, DeflateWorkerAction, DeflateWorkerListener } from '../src/domain/deflateWorker'

export class MockWorker implements DeflateWorker {
  readonly pendingMessages: DeflateWorkerAction[] = []
  deflatedSize = 0
  private listener: DeflateWorkerListener | undefined

  get pendingData() {
    return this.pendingMessages.map((message) => message.data || '').join('')
  }

  addEventListener(_: 'message', listener: DeflateWorkerListener): void {
    if (this.listener) {
      throw new Error('MockWorker supports only one listener')
    }
    this.listener = listener
  }

  removeEventListener(): void {
    this.listener = undefined
  }

  postMessage(message: DeflateWorkerAction): void {
    this.pendingMessages.push(message)
  }

  terminate(): void {
    // do nothing
  }

  process(ignoreMessageWithId?: number): void {
    if (this.listener) {
      for (const message of this.pendingMessages) {
        if (ignoreMessageWithId === message.id) {
          continue
        }
        switch (message.action) {
          case 'write':
            this.deflatedSize += message.data.length
            this.listener({ data: { id: message.id, size: this.deflatedSize } })
            break
          case 'flush':
            if (message.data) {
              this.deflatedSize += message.data.length
            }
            this.listener({ data: { id: message.id, result: new Uint8Array(this.deflatedSize) } })
            this.deflatedSize = 0
        }
      }
    }
    this.pendingMessages.length = 0
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
