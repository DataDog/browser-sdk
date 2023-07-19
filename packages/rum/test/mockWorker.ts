import type { DeflateWorkerAction, DeflateWorkerResponse } from '@datadog/browser-worker'
import type { DeflateWorker } from '../src/domain/segmentCollection'

type DeflateWorkerListener = (event: { data: DeflateWorkerResponse }) => void

export class MockWorker implements DeflateWorker {
  public onmessage = null
  public onmessageerror = null
  public onerror = null

  readonly pendingMessages: DeflateWorkerAction[] = []

  private streams = new Map<number, Uint8Array[]>()
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
            let stream = this.streams.get(message.streamId)
            if (!stream) {
              stream = []
              this.streams.set(message.streamId, stream)
            }
            // In the mock worker, for simplicity, we'll just use the UTF-8 encoded string instead of deflating it.
            const binaryData = new TextEncoder().encode(message.data)
            stream.push(binaryData)

            this.listeners.message.forEach((listener) =>
              listener({
                data: {
                  type: 'wrote',
                  id: message.id,
                  streamId: message.streamId,
                  result: binaryData,
                  trailer: new Uint8Array([32]), // emulate a trailer with a single space
                  additionalBytesCount: binaryData.length,
                },
              })
            )
          }
          break
        case 'reset':
          this.streams.delete(message.streamId)
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
}
