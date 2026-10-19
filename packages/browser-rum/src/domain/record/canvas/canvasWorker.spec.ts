import type { CanvasWorkerRequest, CanvasWorkerResponse, DeflateWorkerAction } from '@datadog/browser-core'
import { createNewEvent, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { MockWorker } from '../../../../test'
import { createCanvasSnapshot } from './canvasSnapshot'
import type { CanvasWorker } from './canvasWorker'
import { CANVAS_WORKER_TIMEOUT_DELAY, isCanvasWorkerSupported, startCanvasWorker } from './canvasWorker'

const CONFIGURATION = {
  enable: true,
  maxFramesPerSecond: 1,
  hashingMaxDimension: 50,
  maxImageDimension: 1000,
  encodeQuality: 0.5,
} as const

describe('startCanvasWorker', () => {
  let worker: MockWorker
  let postMessageSpy: jasmine.Spy<MockWorker['postMessage']>
  // The canvas worker end of the MessageChannel
  let canvasWorkerPort: MessagePort
  let onFailure: jasmine.Spy
  let canvasWorker: CanvasWorker
  let clock: Clock

  beforeEach(() => {
    if (!isCanvasWorkerSupported()) {
      pending('canvas recording not supported')
    }
    clock = mockClock()
    worker = new MockWorker()
    postMessageSpy = spyOn(worker, 'postMessage').and.callFake(
      (message: DeflateWorkerAction, transfer?: Transferable[]) => {
        if (message.action === 'startCanvasWorker') {
          canvasWorkerPort = transfer![0] as MessagePort
        }
      }
    )
    onFailure = jasmine.createSpy()
    canvasWorker = startCanvasWorker(worker, CONFIGURATION, onFailure)

    registerCleanupTask(() => {
      canvasWorker.stop()
      canvasWorkerPort.close()
    })
  })

  // Lets the messages posted so far be delivered. Delivery order across channels is not guaranteed,
  // so this is only enough to check that nothing was received.
  function waitForPostedMessages() {
    return new Promise<void>((resolve) => {
      const { port1, port2 } = new MessageChannel()
      port1.onmessage = () => {
        port1.close()
        resolve()
      }
      port2.postMessage(undefined)
    })
  }

  async function becomeReady() {
    canvasWorkerPort.postMessage({ type: 'ready' } satisfies CanvasWorkerResponse)
    while (!canvasWorker.isReady()) {
      await waitForPostedMessages()
    }
  }

  function receiveRequests(respond?: (request: CanvasWorkerRequest & { action: 'capture' }) => CanvasWorkerResponse) {
    const requests: CanvasWorkerRequest[] = []
    let onRequest: () => void
    const firstRequest = new Promise<void>((resolve) => (onRequest = resolve))
    canvasWorkerPort.onmessage = ({ data }: MessageEvent<CanvasWorkerRequest>) => {
      requests.push(data)
      onRequest()
      if (respond && data.action === 'capture') {
        canvasWorkerPort.postMessage(respond(data))
      }
    }
    return { requests, firstRequest }
  }

  function createSnapshot() {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    return createCanvasSnapshot(canvas, 1000)
  }

  it('asks the Session Replay worker to spawn the canvas worker', () => {
    expect(postMessageSpy).toHaveBeenCalledOnceWith({ action: 'startCanvasWorker' }, [jasmine.any(MessagePort)])
  })

  it('is ready once the canvas worker says so', async () => {
    expect(canvasWorker.isReady()).toBeFalse()

    await becomeReady()

    expect(canvasWorker.isReady()).toBeTrue()
  })

  it('does not send captures before the canvas worker is ready', async () => {
    const { requests } = receiveRequests()

    expect(await canvasWorker.capture(createSnapshot(), undefined)).toBeUndefined()
    await waitForPostedMessages()

    expect(requests).toEqual([])
  })

  it('sends the snapshot to the canvas worker and resolves with its response', async () => {
    const { requests } = receiveRequests(({ id }) => ({ type: 'unchanged', id }))
    await becomeReady()

    expect(await canvasWorker.capture(createSnapshot(), 'previous-hash')).toEqual({ type: 'unchanged', id: 0 })
    expect(requests).toEqual([
      {
        action: 'capture',
        id: 0,
        bitmap: jasmine.any(ImageBitmap),
        canvasWidth: 1,
        canvasHeight: 1,
        lastChangeHash: 'previous-hash',
        hashingMaxDimension: 50,
        encodeQuality: 0.5,
      },
    ])
  })

  it('fails with a timeout when the canvas worker is not ready in time', () => {
    clock.tick(CANVAS_WORKER_TIMEOUT_DELAY)

    expect(onFailure).toHaveBeenCalledOnceWith('timeout', undefined)
    expect(canvasWorker.isReady()).toBeFalse()
  })

  it('fails with a timeout when a capture is not answered in time', async () => {
    const { firstRequest } = receiveRequests()
    await becomeReady()

    const response = canvasWorker.capture(createSnapshot(), undefined)
    await firstRequest
    clock.tick(CANVAS_WORKER_TIMEOUT_DELAY)

    expect(await response).toBeUndefined()
    expect(onFailure).toHaveBeenCalledOnceWith('timeout', undefined)
  })

  it('fails to spawn when the Session Replay worker reports an error before the canvas worker is ready', () => {
    worker.dispatchEvent(createNewEvent('message', { data: { type: 'canvasWorkerErrored', error: 'blocked' } }))

    expect(onFailure).toHaveBeenCalledOnceWith('spawn', 'blocked')
  })

  it('fails with an error when the Session Replay worker reports an error once the canvas worker is ready', async () => {
    await becomeReady()

    worker.dispatchEvent(createNewEvent('message', { data: { type: 'canvasWorkerErrored', error: 'crashed' } }))

    expect(onFailure).toHaveBeenCalledOnceWith('error', 'crashed')
  })

  it('stops the canvas worker and resolves pending captures', async () => {
    const { firstRequest } = receiveRequests()
    await becomeReady()
    const response = canvasWorker.capture(createSnapshot(), undefined)
    await firstRequest
    const stopRequest = new Promise((resolve) => {
      canvasWorkerPort.onmessage = ({ data }: MessageEvent<CanvasWorkerRequest>) => resolve(data)
    })

    canvasWorker.stop()

    expect(await response).toBeUndefined()
    expect(await stopRequest).toEqual({ action: 'stop' })
    clock.tick(CANVAS_WORKER_TIMEOUT_DELAY)
    expect(onFailure).not.toHaveBeenCalled()
  })
})
