import { DeflateWorker, DeflateWorkerAction, DeflateWorkerListener } from '../src/domain/deflateWorker'
import { IncrementalSource, MouseMoveRecord, MousePosition, RecordType } from '../src/types'

export function makeMouseMoveRecord(timestamp: number, positions: Array<Partial<MousePosition>>): MouseMoveRecord {
  return {
    timestamp,
    data: {
      positions: positions.map((position) => ({ id: 0, timeOffset: 0, x: 0, y: 1, ...position })),
      source: IncrementalSource.MouseMove,
    },
    type: RecordType.IncrementalSnapshot,
  }
}

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
          case 'complete':
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
