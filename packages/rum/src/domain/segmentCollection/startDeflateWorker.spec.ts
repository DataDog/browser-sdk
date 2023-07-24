import type { RawTelemetryEvent } from '@datadog/browser-core'
import { display, isIE, noop, resetTelemetry, startFakeTelemetry } from '@datadog/browser-core'
import type { DeflateWorkerResponse } from '@datadog/browser-worker'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { MockWorker } from '../../../test'
import type { DeflateWorker } from './startDeflateWorker'
import { startDeflateWorker, resetDeflateWorkerState, createDeflateWorker } from './startDeflateWorker'

describe('startDeflateWorker', () => {
  let deflateWorker: MockWorker
  let createDeflateWorkerSpy: jasmine.Spy<typeof createDeflateWorker>
  let callbackSpy: jasmine.Spy
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    deflateWorker = new MockWorker()
    callbackSpy = jasmine.createSpy('callbackSpy')
    createDeflateWorkerSpy = jasmine.createSpy('createDeflateWorkerSpy').and.callFake(() => deflateWorker)
  })

  afterEach(() => {
    resetDeflateWorkerState()
  })

  it('creates a deflate worker and call callback when initialized', () => {
    startDeflateWorker(configuration, callbackSpy, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    deflateWorker.processAllMessages()
    expect(callbackSpy).toHaveBeenCalledOnceWith(deflateWorker)
  })

  it('uses the previously created worker', () => {
    startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
    deflateWorker.processAllMessages()

    startDeflateWorker(configuration, callbackSpy, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    deflateWorker.processAllMessages()
    expect(callbackSpy).toHaveBeenCalledOnceWith(deflateWorker)
  })

  describe('loading state', () => {
    it('does not create multiple workers when called multiple times while the worker is loading', () => {
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
      expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    })

    it('calls all registered callbacks when the worker is initialized', () => {
      const callbackSpy1 = jasmine.createSpy()
      const callbackSpy2 = jasmine.createSpy()
      startDeflateWorker(configuration, callbackSpy1, createDeflateWorkerSpy)
      startDeflateWorker(configuration, callbackSpy2, createDeflateWorkerSpy)
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
    let configuration: RumConfiguration

    beforeEach(() => {
      if (isIE()) {
        pending('IE does not support CSP blocking worker creation')
      }
      configuration = {} as RumConfiguration
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
      startDeflateWorker(configuration, noop, () => {
        throw CSP_ERROR
      })
      expect(displaySpy).toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })

    it('does not report CSP errors to telemetry', () => {
      startDeflateWorker(configuration, noop, () => {
        throw CSP_ERROR
      })
      expect(telemetryEvents).toEqual([])
    })

    it('displays ErrorEvent as CSP error', () => {
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()
      expect(displaySpy).toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })
    it('calls the callback without argument in case of an error occurs during loading', () => {
      startDeflateWorker(configuration, callbackSpy, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()
      expect(callbackSpy).toHaveBeenCalledOnceWith()
    })

    it('calls the callback without argument in case of an error occurred in a previous loading', () => {
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()

      startDeflateWorker(configuration, callbackSpy, createDeflateWorkerSpy)
      expect(callbackSpy).toHaveBeenCalledOnceWith()
    })
  })

  describe('worker unknown error', () => {
    let telemetryEvents: RawTelemetryEvent[]
    const UNKNOWN_ERROR = new Error('boom')
    let displaySpy: jasmine.Spy
    let configuration: RumConfiguration

    beforeEach(() => {
      configuration = {} as RumConfiguration
      displaySpy = spyOn(display, 'error')
      telemetryEvents = startFakeTelemetry()
    })

    afterEach(() => {
      resetTelemetry()
    })

    it('displays an error message when the worker creation throws an unknown error', () => {
      startDeflateWorker(configuration, noop, () => {
        throw UNKNOWN_ERROR
      })
      expect(displaySpy).toHaveBeenCalledOnceWith(
        'Session Replay recording failed to start: an error occurred while creating the Worker:',
        UNKNOWN_ERROR
      )
    })

    it('reports unknown errors to telemetry', () => {
      startDeflateWorker(configuration, noop, () => {
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
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorMessage('foo')
      expect(displaySpy).not.toHaveBeenCalledWith(
        'Please make sure CSP is correctly configured https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    })

    it('reports errors occurring after loading to telemetry', () => {
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
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
  it('buffers data and responds with the buffer deflated compressedBytesCount when writing', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 3, (events) => {
      expect(events).toEqual([
        { type: 'wrote', id: 0, compressedBytesCount: 11, additionalBytesCount: 3 },
        { type: 'wrote', id: 1, compressedBytesCount: 20, additionalBytesCount: 3 },
        { type: 'wrote', id: 2, compressedBytesCount: 29, additionalBytesCount: 3 },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, action: 'write', data: 'bar' })
    deflateWorker.postMessage({ id: 2, action: 'write', data: 'baz' })
  })

  it('responds with the resulting bytes when completing', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 2, (events) => {
      expect(events).toEqual([
        { type: 'wrote', id: 0, compressedBytesCount: 11, additionalBytesCount: 3 },
        {
          type: 'flushed',
          id: 1,
          result: new Uint8Array([120, 156, 74, 203, 207, 7, 0, 0, 0, 255, 255, 3, 0, 2, 130, 1, 69]),
          additionalBytesCount: 0,
          rawBytesCount: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, action: 'flush' })
  })

  it('writes the remaining data specified by "flush"', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 1, (events) => {
      expect(events).toEqual([
        {
          type: 'flushed',
          id: 0,
          result: new Uint8Array([120, 156, 74, 203, 207, 7, 0, 0, 0, 255, 255, 3, 0, 2, 130, 1, 69]),
          additionalBytesCount: 3,
          rawBytesCount: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'flush', data: 'foo' })
  })

  it('flushes several deflates one after the other', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 4, (events) => {
      expect(events).toEqual([
        {
          type: 'wrote',
          id: 0,
          compressedBytesCount: 11,
          additionalBytesCount: 3,
        },
        {
          type: 'flushed',
          id: 1,
          result: new Uint8Array([120, 156, 74, 203, 207, 7, 0, 0, 0, 255, 255, 3, 0, 2, 130, 1, 69]),
          additionalBytesCount: 0,
          rawBytesCount: 3,
        },
        {
          type: 'wrote',
          id: 2,
          compressedBytesCount: 11,
          additionalBytesCount: 3,
        },
        {
          type: 'flushed',
          id: 3,
          result: new Uint8Array([120, 156, 74, 74, 44, 2, 0, 0, 0, 255, 255, 3, 0, 2, 93, 1, 54]),
          additionalBytesCount: 0,
          rawBytesCount: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, action: 'flush' })
    deflateWorker.postMessage({ id: 2, action: 'write', data: 'bar' })
    deflateWorker.postMessage({ id: 3, action: 'flush' })
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
