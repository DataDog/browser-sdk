import type { CanvasCaptureAction, CanvasCaptureResponse, DeflateWorker, SdkWorkerAction } from '@datadog/browser-core'
import { createNewEvent, MockEventTarget } from '../../browser-core/test'

export class MockWorker extends MockEventTarget implements DeflateWorker {
  public onmessage = null
  public onmessageerror = null
  public onerror = null

  readonly pendingMessages: SdkWorkerAction[] = []

  private streams = new Map<number, Uint8Array[]>()
  private canvasCaptures: Array<Promise<void>> = []

  postMessage(message: SdkWorkerAction): void {
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
            const binaryData = new TextEncoder().encode(message.data)
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
        case 'captureCanvas':
          this.canvasCaptures.push(
            captureCanvas(message).then((data) => {
              this.dispatchEvent(createNewEvent('message', { data }))
            })
          )
          break
      }
    }
  }

  /** Resolves once the processed canvas captures have been responded to */
  async waitForCanvasCaptures() {
    const canvasCaptures = this.canvasCaptures
    this.canvasCaptures = []
    await Promise.all(canvasCaptures)
  }

  dispatchErrorEvent() {
    const error = createNewEvent('error')
    this.dispatchEvent(error)
  }

  dispatchErrorMessage(error: Error | string, streamId?: number) {
    this.dispatchEvent(createNewEvent('message', { data: { type: 'errored', error, streamId } }))
  }
}

// Like the real worker, but hashes the full bitmap pixels, which is enough to detect changes.
async function captureCanvas({
  id,
  bitmap,
  canvasWidth,
  canvasHeight,
  lastChangeHash,
  encodeQuality,
}: CanvasCaptureAction): Promise<CanvasCaptureResponse> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const hash = `${canvasWidth}x${canvasHeight}-${context.getImageData(0, 0, canvas.width, canvas.height).data.join(',')}`
  if (hash === lastChangeHash) {
    return { type: 'canvasUnchanged', id }
  }
  return {
    type: 'canvasCaptured',
    id,
    hash,
    image: await canvas.convertToBlob({ type: 'image/webp', quality: encodeQuality }),
  }
}
