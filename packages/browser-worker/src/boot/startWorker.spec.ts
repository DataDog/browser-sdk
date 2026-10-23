import type {
  CanvasWorkerRequest,
  CanvasWorkerResponse,
  DeflateWorkerAction,
  DeflateWorkerResponse,
} from '@datadog/browser-core'
import { collectAsyncCalls, registerCleanupTask } from '@datadog/browser-core/test'
import type { WorkerScope } from './startWorker'
import { startWorker } from './startWorker'

// Arbitrary stream ids used for tests
const TEST_STREAM_ID = 5
const OTHER_TEST_STREAM_ID = 6

// Zlib streams using a default compression are starting with bytes 120 156 (0x78 0x9c)
// https://stackoverflow.com/a/9050274
const STREAM_START = [120, 156]

// Deflate block generated when compressing "foo" alone
const FOO_COMPRESSED = [74, 203, 207, 7, 0, 0, 0, 255, 255]
// Zlib trailer when finishing the stream after compressing "foo"
const FOO_COMPRESSED_TRAILER = [3, 0, 2, 130, 1, 69] // empty deflate block + adler32 checksum

// Deflate block generated when compressing "bar" alone
const BAR_COMPRESSED = [74, 74, 44, 2, 0, 0, 0, 255, 255]
// Zlib trailer when finishing the stream after compressing "bar"
const BAR_COMPRESSED_TRAILER = [3, 0, 2, 93, 1, 54]

// Deflate block generated when compressing "baz" alone
const BAZ_COMPRESSED = [74, 74, 172, 2, 0, 0, 0, 255, 255]

// Zlib trailer when finishing the stream after compressing "foo" then "bar"
const FOO_BAR_COMPRESSED_TRAILER = [3, 0, 8, 171, 2, 122]
// Zlib trailer when finishing the stream after compressing "foo" then "bar" then "baz"
const FOO_BAR_BAZ_COMPRESSED_TRAILER = [3, 0, 18, 123, 3, 183]
// Zlib trailer when finishing the stream after compressing "foo" then "baz"
const FOO_BAZ_COMPRESSED_TRAILER = [3, 0, 8, 179, 2, 130]

describe('startWorker', () => {
  let workerScope: {
    addEventListener: jasmine.Spy<WorkerScope['addEventListener']>
    postMessage: jasmine.Spy<WorkerScope['postMessage']>
    close: jasmine.Spy<WorkerScope['close']>
  }

  beforeEach(() => {
    workerScope = {
      addEventListener: jasmine.createSpy(),
      postMessage: jasmine.createSpy(),
      close: jasmine.createSpy(),
    }
    startWorker(workerScope)
  })

  function emulateAction(message: DeflateWorkerAction, ports: MessagePort[] = []): DeflateWorkerResponse {
    workerScope.postMessage.calls.reset()
    workerScope.addEventListener.calls.allArgs().forEach(([eventName, listener]) => {
      if (eventName === 'message') {
        listener({ data: message, ports } as unknown as MessageEvent)
      }
    })
    return workerScope.postMessage.calls.mostRecent()?.args[0]
  }

  it('buffers data and responds with the buffer deflated result when writing', () => {
    expect(emulateAction({ id: 0, streamId: TEST_STREAM_ID, action: 'write', data: 'foo' })).toEqual({
      type: 'wrote',
      id: 0,
      streamId: TEST_STREAM_ID,
      result: new Uint8Array([...STREAM_START, ...FOO_COMPRESSED]),
      trailer: new Uint8Array(FOO_COMPRESSED_TRAILER),
      additionalBytesCount: 3,
    })

    expect(emulateAction({ id: 1, streamId: TEST_STREAM_ID, action: 'write', data: 'bar' })).toEqual({
      type: 'wrote',
      id: 1,
      streamId: TEST_STREAM_ID,
      result: new Uint8Array(BAR_COMPRESSED),
      trailer: new Uint8Array(FOO_BAR_COMPRESSED_TRAILER),
      additionalBytesCount: 3,
    })

    expect(emulateAction({ id: 2, streamId: TEST_STREAM_ID, action: 'write', data: 'baz' })).toEqual({
      type: 'wrote',
      id: 2,
      streamId: TEST_STREAM_ID,
      result: new Uint8Array(BAZ_COMPRESSED),
      trailer: new Uint8Array(FOO_BAR_BAZ_COMPRESSED_TRAILER),
      additionalBytesCount: 3,
    })
  })

  it('resets the stream state', () => {
    expect(emulateAction({ action: 'write', id: 0, streamId: TEST_STREAM_ID, data: 'foo' })).toEqual({
      type: 'wrote',
      id: 0,
      streamId: TEST_STREAM_ID,
      result: new Uint8Array([...STREAM_START, ...FOO_COMPRESSED]),
      trailer: new Uint8Array(FOO_COMPRESSED_TRAILER),
      additionalBytesCount: 3,
    })
    expect(emulateAction({ action: 'reset', streamId: TEST_STREAM_ID })).toBeUndefined()
    expect(emulateAction({ action: 'write', id: 1, streamId: TEST_STREAM_ID, data: 'bar' })).toEqual({
      type: 'wrote',
      id: 1,
      streamId: TEST_STREAM_ID,
      // As the result starts with the beginning of a stream, we are sure that `reset` was
      // effective
      result: new Uint8Array([...STREAM_START, ...BAR_COMPRESSED]),
      trailer: new Uint8Array(BAR_COMPRESSED_TRAILER),
      additionalBytesCount: 3,
    })
    expect(emulateAction({ action: 'reset', streamId: TEST_STREAM_ID })).toBeUndefined()
  })

  it('support writing to different streams at the same time', () => {
    expect(
      emulateAction({
        id: 0,
        streamId: TEST_STREAM_ID,
        action: 'write',
        data: 'foo',
      })
    ).toEqual({
      type: 'wrote',
      id: 0,
      streamId: TEST_STREAM_ID,
      result: new Uint8Array([...STREAM_START, ...FOO_COMPRESSED]),
      trailer: new Uint8Array(FOO_COMPRESSED_TRAILER),
      additionalBytesCount: 3,
    })

    expect(
      emulateAction({
        id: 1,
        streamId: OTHER_TEST_STREAM_ID,
        action: 'write',
        data: 'bar',
      })
    ).toEqual({
      type: 'wrote',
      id: 1,
      streamId: OTHER_TEST_STREAM_ID,
      result: new Uint8Array([...STREAM_START, ...BAR_COMPRESSED]),
      trailer: new Uint8Array(BAR_COMPRESSED_TRAILER),
      additionalBytesCount: 3,
    })

    expect(
      emulateAction({
        streamId: OTHER_TEST_STREAM_ID,
        action: 'reset',
      })
    ).toBeUndefined()

    expect(
      emulateAction({
        id: 2,
        streamId: TEST_STREAM_ID,
        action: 'write',
        data: 'baz',
      })
    ).toEqual({
      type: 'wrote',
      id: 2,
      streamId: TEST_STREAM_ID,
      result: new Uint8Array(BAZ_COMPRESSED),
      trailer: new Uint8Array(FOO_BAZ_COMPRESSED_TRAILER),
      additionalBytesCount: 3,
    })
  })

  it('reports an error when an unexpected exception occurs', () => {
    expect(emulateAction(null as any)).toEqual({
      type: 'errored',
      error: jasmine.any(TypeError),
      streamId: undefined,
    })
  })

  it('reports an error when an unexpected exception occurs while writing on a stream', () => {
    spyOn(TextEncoder.prototype, 'encode').and.callFake(() => {
      throw new Error('Something went wrong!')
    })
    expect(
      emulateAction({
        id: 2,
        streamId: TEST_STREAM_ID,
        action: 'write',
        data: 'baz',
      })
    ).toEqual({
      type: 'errored',
      error: new Error('Something went wrong!'),
      streamId: TEST_STREAM_ID,
    })
  })

  it('use the string representation of the error when it fails to send it through postMessage', () => {
    workerScope.postMessage.and.callFake((response) => {
      if (response.type === 'errored' && response.error instanceof Error) {
        throw new DOMException("Failed to execute 'postMessage' on 'WorkerScope'")
      }
    })
    expect(emulateAction(null as any)).toEqual({
      type: 'errored',
      error: jasmine.stringContaining('TypeError'),
      streamId: undefined,
    })
  })

  describe('canvas worker', () => {
    let port: MessagePort
    let canvasWorkerPort: MessagePort

    beforeEach(() => {
      ;({ port1: port, port2: canvasWorkerPort } = new MessageChannel())
      registerCleanupTask(() => port.close())
    })

    it('reports an error when the canvas worker fails to spawn', () => {
      spyOn(window, 'Worker').and.throwError(new Error('blocked'))

      expect(emulateAction({ action: 'startCanvasWorker' }, [canvasWorkerPort])).toEqual({
        type: 'canvasWorkerErrored',
        error: 'Error: blocked',
      })
    })

    it('reports canvas worker errors without propagating them to the worker', () => {
      const canvasWorker = Object.assign(new EventTarget(), { postMessage: jasmine.createSpy() })
      spyOn(window, 'Worker').and.returnValue(canvasWorker as unknown as Worker)
      emulateAction({ action: 'startCanvasWorker' }, [canvasWorkerPort])
      expect(canvasWorker.postMessage).toHaveBeenCalledOnceWith({ action: 'canvasInit' }, [canvasWorkerPort])

      const errorEvent = new ErrorEvent('error', { message: 'crashed', cancelable: true })
      canvasWorker.dispatchEvent(errorEvent)

      expect(errorEvent.defaultPrevented).toBeTrue()
      expect(workerScope.postMessage).toHaveBeenCalledOnceWith({ type: 'canvasWorkerErrored', error: 'crashed' })
    })

    it('answers capture requests on the port once initialized', async () => {
      if (typeof OffscreenCanvas === 'undefined') {
        pending('OffscreenCanvas not supported')
      }
      const responses: CanvasWorkerResponse[] = []
      const twoResponses = new Promise<void>((resolve) => {
        port.onmessage = ({ data }: MessageEvent<CanvasWorkerResponse>) => {
          if (responses.push(data) === 2) {
            resolve()
          }
        }
      })

      emulateAction({ action: 'canvasInit' }, [canvasWorkerPort])
      const canvas = new OffscreenCanvas(1, 1)
      canvas.getContext('2d')!.fillRect(0, 0, 1, 1)
      const bitmap = await createImageBitmap(canvas)
      port.postMessage(
        {
          action: 'capture',
          id: 1,
          bitmap,
          canvasWidth: 1,
          canvasHeight: 1,
          lastChangeHash: undefined,
          hashingMaxDimension: 100,
          encodeQuality: 0.5,
        } satisfies CanvasWorkerRequest,
        [bitmap]
      )
      await twoResponses

      expect(responses).toEqual([
        { type: 'ready' },
        { type: 'captured', id: 1, hash: jasmine.any(String), image: jasmine.any(Blob) },
      ])
    })

    it('closes itself when asked to stop', async () => {
      emulateAction({ action: 'canvasInit' }, [canvasWorkerPort])

      port.postMessage({ action: 'stop' } satisfies CanvasWorkerRequest)

      await collectAsyncCalls(workerScope.close, 1)
    })
  })
})
