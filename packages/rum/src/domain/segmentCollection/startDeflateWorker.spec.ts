import type { RawTelemetryEvent } from '@datadog/browser-core'
import { display, isIE, noop, resetTelemetry, startFakeTelemetry } from '@datadog/browser-core'
import type { DeflateWorkerResponse } from '@datadog/browser-worker'
import { MockWorker } from '../../../test'
import type { DeflateWorker } from './startDeflateWorker'
import { startDeflateWorker, resetDeflateWorkerState, createDeflateWorker } from './startDeflateWorker'

describe('startDeflateWorker', () => {
  let deflateWorker: MockWorker
  let createDeflateWorkerSpy: jasmine.Spy<typeof createDeflateWorker>
  let callbackSpy: jasmine.Spy

  beforeEach(() => {
    deflateWorker = new MockWorker()
    callbackSpy = jasmine.createSpy('callbackSpy')
    createDeflateWorkerSpy = jasmine.createSpy('createDeflateWorkerSpy').and.callFake(() => deflateWorker)
  })

  afterEach(() => {
    resetDeflateWorkerState()
  })

  it('creates a deflate worker and call callback when initialized', () => {
    startDeflateWorker(callbackSpy, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    deflateWorker.processAllMessages()
    expect(callbackSpy).toHaveBeenCalledOnceWith(deflateWorker)
  })

  it('uses the previously created worker', () => {
    startDeflateWorker(noop, createDeflateWorkerSpy)
    deflateWorker.processAllMessages()

    startDeflateWorker(callbackSpy, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    deflateWorker.processAllMessages()
    expect(callbackSpy).toHaveBeenCalledOnceWith(deflateWorker)
  })

  describe('loading state', () => {
    it('does not create multiple workers when called multiple times while the worker is loading', () => {
      startDeflateWorker(noop, createDeflateWorkerSpy)
      startDeflateWorker(noop, createDeflateWorkerSpy)
      expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    })

    it('calls all registered callbacks when the worker is initialized', () => {
      const callbackSpy1 = jasmine.createSpy()
      const callbackSpy2 = jasmine.createSpy()
      startDeflateWorker(callbackSpy1, createDeflateWorkerSpy)
      startDeflateWorker(callbackSpy2, createDeflateWorkerSpy)
      deflateWorker.processAllMessages()
      expect(callbackSpy1).toHaveBeenCalledOnceWith(deflateWorker)
      expect(callbackSpy2).toHaveBeenCalledOnceWith(deflateWorker)
    })
  })

  describe('worker CSP error', () => {
    let telemetryEvents: RawTelemetryEvent[]
    // mimic Chrome behavior
    let CSP_ERROR: DOMException
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      if (isIE()) {
        pending('IE does not support CSP blocking worker creation')
      }
      displaySpy = spyOn(display, 'error')
      telemetryEvents = startFakeTelemetry()
      CSP_ERROR = new DOMException(
        "Failed to construct 'Worker': Access to the script at 'blob:https://example.org/9aadbb61-effe-41ee-aa76-fc607053d642' is denied by the document's Content Security Policy."
      )
    })

    afterEach(() => {
      resetTelemetry()
    })

    it('displays CSP instructions when the worker creation throws a CSP error', () => {
      startDeflateWorker(noop, () => {
        throw CSP_ERROR
      })
      expect(displaySpy).toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })

    it('does not report CSP errors to telemetry', () => {
      startDeflateWorker(noop, () => {
        throw CSP_ERROR
      })
      expect(telemetryEvents).toEqual([])
    })

    it('displays ErrorEvent as CSP error', () => {
      startDeflateWorker(noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()
      expect(displaySpy).toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })
    it('calls the callback without argument in case of an error occurs during loading', () => {
      startDeflateWorker(callbackSpy, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()
      expect(callbackSpy).toHaveBeenCalledOnceWith()
    })

    it('calls the callback without argument in case of an error occurred in a previous loading', () => {
      startDeflateWorker(noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()

      startDeflateWorker(callbackSpy, createDeflateWorkerSpy)
      expect(callbackSpy).toHaveBeenCalledOnceWith()
    })
  })

  describe('worker unknown error', () => {
    let telemetryEvents: RawTelemetryEvent[]
    const UNKNOWN_ERROR = new Error('boom')
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      telemetryEvents = startFakeTelemetry()
    })

    afterEach(() => {
      resetTelemetry()
    })

    it('displays an error message when the worker creation throws an unknown error', () => {
      startDeflateWorker(noop, () => {
        throw UNKNOWN_ERROR
      })
      expect(displaySpy).toHaveBeenCalledOnceWith(
        'Session Replay recording failed to start: an error occurred while creating the Worker:',
        UNKNOWN_ERROR
      )
    })

    it('reports unknown errors to telemetry', () => {
      startDeflateWorker(noop, () => {
        throw UNKNOWN_ERROR
      })
      expect(telemetryEvents).toEqual([
        {
          type: 'log',
          status: 'error',
          message: 'boom',
          error: { kind: 'Error', stack: jasmine.any(String) },
        },
      ])
    })

    it('does not display error messages as CSP error', () => {
      startDeflateWorker(noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorMessage('foo')
      expect(displaySpy).not.toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })

    it('reports errors occurring after loading to telemetry', () => {
      startDeflateWorker(noop, createDeflateWorkerSpy)
      deflateWorker.processAllMessages()

      deflateWorker.dispatchErrorMessage('boom')
      expect(telemetryEvents).toEqual([
        {
          type: 'log',
          status: 'error',
          message: 'Uncaught "boom"',
          error: { stack: jasmine.any(String) },
        },
      ])
    })
  })
})

describe('createDeflateWorker', () => {
  beforeEach(() => {
    if (isIE()) {
      pending('no TextEncoder support')
    }
  })

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

  it('buffers data and responds with the buffer deflated result when writing', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 3, (events) => {
      expect(events).toEqual([
        {
          type: 'wrote',
          id: 0,
          streamId: 1,
          result: new Uint8Array([...STREAM_START, ...FOO_COMPRESSED]),
          trailer: new Uint8Array(FOO_COMPRESSED_TRAILER),
          additionalBytesCount: 3,
        },
        {
          type: 'wrote',
          id: 1,
          streamId: 1,
          result: new Uint8Array(BAR_COMPRESSED),
          trailer: new Uint8Array(FOO_BAR_COMPRESSED_TRAILER),
          additionalBytesCount: 3,
        },
        {
          type: 'wrote',
          id: 2,
          streamId: 1,
          result: new Uint8Array(BAZ_COMPRESSED),
          trailer: new Uint8Array(FOO_BAR_BAZ_COMPRESSED_TRAILER),
          additionalBytesCount: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, streamId: 1, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, streamId: 1, action: 'write', data: 'bar' })
    deflateWorker.postMessage({ id: 2, streamId: 1, action: 'write', data: 'baz' })
  })

  it('resets the stream state', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 2, (events) => {
      expect(events).toEqual([
        {
          type: 'wrote',
          id: 0,
          streamId: 1,
          result: new Uint8Array([...STREAM_START, ...FOO_COMPRESSED]),
          trailer: new Uint8Array(FOO_COMPRESSED_TRAILER),
          additionalBytesCount: 3,
        },
        {
          type: 'wrote',
          id: 1,
          streamId: 1,
          // As the result starts with the beginning of a stream, we are sure that `reset` was
          // effective
          result: new Uint8Array([...STREAM_START, ...BAR_COMPRESSED]),
          trailer: new Uint8Array(BAR_COMPRESSED_TRAILER),
          additionalBytesCount: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ action: 'write', id: 0, streamId: 1, data: 'foo' })
    deflateWorker.postMessage({ action: 'reset', streamId: 1 })
    deflateWorker.postMessage({ action: 'write', id: 1, streamId: 1, data: 'bar' })
    deflateWorker.postMessage({ action: 'reset', streamId: 1 })
  })

  it('support writing to different streams at the same time', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 3, (events) => {
      expect(events).toEqual([
        {
          type: 'wrote',
          id: 0,
          streamId: 1,
          result: new Uint8Array([...STREAM_START, ...FOO_COMPRESSED]),
          trailer: new Uint8Array(FOO_COMPRESSED_TRAILER),
          additionalBytesCount: 3,
        },
        {
          type: 'wrote',
          id: 1,
          streamId: 2,
          result: new Uint8Array([...STREAM_START, ...BAR_COMPRESSED]),
          trailer: new Uint8Array(BAR_COMPRESSED_TRAILER),
          additionalBytesCount: 3,
        },
        {
          type: 'wrote',
          id: 2,
          streamId: 1,
          result: new Uint8Array(BAZ_COMPRESSED),
          trailer: new Uint8Array(FOO_BAZ_COMPRESSED_TRAILER),
          additionalBytesCount: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, streamId: 1, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, streamId: 2, action: 'write', data: 'bar' })
    deflateWorker.postMessage({ streamId: 2, action: 'reset' })
    deflateWorker.postMessage({ id: 2, streamId: 1, action: 'write', data: 'baz' })
  })

  it('reports an error when an unexpected exception occurs', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 1, (events) => {
      const event = events[0] as Extract<DeflateWorkerResponse, { type: 'errored' }>
      expect(event.type).toBe('errored')
      // Some browsers are able to transmit the error instance, some are sending only the message
      // as a string
      expect(String(event.error)).toEqual(jasmine.stringContaining('TypeError'))
      done()
    })
    deflateWorker.postMessage(null as any)
  })

  function listen(
    deflateWorker: DeflateWorker,
    expectedResponseCount: number,
    onDone: (responses: DeflateWorkerResponse[]) => void
  ) {
    const responses: DeflateWorkerResponse[] = []
    const listener = (event: { data: DeflateWorkerResponse }) => {
      const responsesCount = responses.push(event.data)
      if (responsesCount === expectedResponseCount) {
        deflateWorker.removeEventListener('message', listener)
        onDone(responses)
      }
    }
    deflateWorker.addEventListener('message', listener)
  }
})
