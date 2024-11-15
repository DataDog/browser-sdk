import type { DeflateWorker, DeflateWorkerAction } from '@datadog/browser-core'
import { string2buf } from '../../worker/src/domain/deflate'
import { createNewEvent, MockEventTarget } from '../../core/test'

export class MockWorker extends MockEventTarget implements DeflateWorker {
  public onmessage = null
  public onmessageerror = null
  public onerror = null

  readonly pendingMessages: DeflateWorkerAction[] = []

  private streams = new Map<number, Uint8Array[]>()

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
          this.dispatchEvent(
            createNewEvent('message', {
              data: {
                type: 'initialized',
                version: 'dev',
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
            const binaryData = string2buf(message.data)
            stream.push(binaryData)
            this.dispatchEvent(
              createNewEvent('message', {
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
    const error = createNewEvent('error')
    this.dispatchEvent(error)
  }

  dispatchErrorMessage(error: Error | string, streamId?: number) {
    this.dispatchEvent(createNewEvent('message', { data: { type: 'errored', error, streamId } }))
  }
}
