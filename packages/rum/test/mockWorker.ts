import type { DeflateWorker, DeflateWorkerAction, DeflateWorkerListener } from '../src/domain/segmentCollection'

export class MockWorker implements DeflateWorker {
  public onmessage = null
  public onmessageerror = null
  public onerror = null

  readonly pendingMessages: DeflateWorkerAction[] = []
  private rawBytesCount = 0
  private deflatedData: Uint8Array[] = []
  private listeners: {
    message: DeflateWorkerListener[]
    error: Array<(error: unknown) => void>
  } = { message: [], error: [] }

  addEventListener(eventName: 'message' | 'error', listener: any): void {
    const index = this.listeners[eventName].indexOf(listener)
    if (index < 0) {
      this.listeners[eventName].push(listener)
    }
  }

  removeEventListener(eventName: 'message' | 'error', listener: any): void {
    const index = this.listeners[eventName].indexOf(listener)
    if (index >= 0) {
      this.listeners[eventName].splice(index, 1)
    }
  }

  dispatchEvent(): boolean {
    // Partial implementation, feel free to implement
    throw new Error('not yet implemented')
  }

  postMessage(message: DeflateWorkerAction): void {
    this.pendingMessages.push(message)
  }

  terminate(): void {
    // do nothing
  }

  get pendingData() {
    return this.pendingMessages.map((message) => ('data' in message ? message.data : '')).join('')
  }

  get messageListenersCount() {
    return this.listeners.message.length
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
      switch (message.action) {
        case 'init':
          this.listeners.message.forEach((listener) =>
            listener({
              data: {
                type: 'initialized',
              },
            })
          )
          break
        case 'write':
          {
            const additionalBytesCount = this.pushData(message.data)
            this.listeners.message.forEach((listener) =>
              listener({
                data: {
                  type: 'wrote',
                  id: message.id,
                  compressedBytesCount: uint8ArraysSize(this.deflatedData),
                  additionalBytesCount,
                },
              })
            )
          }
          break
        case 'flush':
          {
            const additionalBytesCount = this.pushData(message.data)
            this.listeners.message.forEach((listener) =>
              listener({
                data: {
                  type: 'flushed',
                  id: message.id,
                  result: mergeUint8Arrays(this.deflatedData),
                  rawBytesCount: this.rawBytesCount,
                  additionalBytesCount,
                },
              })
            )
            this.deflatedData.length = 0
            this.rawBytesCount = 0
          }
          break
      }
    }
  }

  dispatchErrorEvent() {
    const error = new ErrorEvent('worker')
    this.listeners.error.forEach((listener) => listener(error))
  }

  dispatchErrorMessage(error: Error | string) {
    this.listeners.message.forEach((listener) => listener({ data: { type: 'errored', error } }))
  }

  private pushData(data?: string) {
    const encodedData = new TextEncoder().encode(data)
    this.rawBytesCount += encodedData.length
    // In the mock worker, for simplicity, we'll just use the UTF-8 encoded string instead of deflating it.
    this.deflatedData.push(encodedData)
    return encodedData.length
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
