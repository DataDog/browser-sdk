import type { RawTelemetryEvent } from '@datadog/browser-core'
import { display, isIE, noop, resetTelemetry, startFakeTelemetry } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { MockWorker } from '../../../test'
import type { createDeflateWorker } from './deflateWorker'
import { startDeflateWorker, resetDeflateWorkerState, INITIALIZATION_TIME_OUT_DELAY } from './deflateWorker'

// Arbitrary stream ids used for tests
const TEST_STREAM_ID = 5

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
      expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Please make sure CSP is correctly configured'))
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
      expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Please make sure CSP is correctly configured'))
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

    it('adjusts the error message when a workerUrl is set', () => {
      configuration.workerUrl = '/worker.js'
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
      deflateWorker.dispatchErrorEvent()
      expect(displaySpy).toHaveBeenCalledWith(
        jasmine.stringContaining(
          'Please make sure the Worker URL /worker.js is correct and CSP is correctly configured.'
        )
      )
    })
  })

  describe('initialization timeout', () => {
    let displaySpy: jasmine.Spy
    let configuration: RumConfiguration
    let clock: Clock

    beforeEach(() => {
      configuration = {} as RumConfiguration
      displaySpy = spyOn(display, 'error')
      clock = mockClock()
    })

    afterEach(() => {
      clock.cleanup()
    })

    it('displays an error message when the worker does not respond to the init action', () => {
      startDeflateWorker(
        configuration,
        noop,
        () =>
          // Creates a worker that does nothing
          new Worker(URL.createObjectURL(new Blob([''])))
      )
      clock.tick(INITIALIZATION_TIME_OUT_DELAY)
      expect(displaySpy).toHaveBeenCalledOnceWith(
        'Session Replay recording failed to start: a timeout occurred while initializing the Worker'
      )
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
      expect(displaySpy).not.toHaveBeenCalledWith(jasmine.stringContaining('CSP'))
    })

    it('reports errors occurring after loading to telemetry', () => {
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
      deflateWorker.processAllMessages()

      deflateWorker.dispatchErrorMessage('boom', TEST_STREAM_ID)
      expect(telemetryEvents).toEqual([
        {
          type: 'log',
          status: 'error',
          message: 'Uncaught "boom"',
          error: { stack: jasmine.any(String) },
          worker_version: 'dev',
          stream_id: TEST_STREAM_ID,
        },
      ])
    })
  })
})
