import type { RawTelemetryEvent } from '@datadog/browser-core'
import { display, isIE, noop, resetTelemetry, startFakeTelemetry } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { MockWorker } from '../../../test'
import type { CreateDeflateWorker } from './deflateWorker'
import { startDeflateWorker, resetDeflateWorkerState, INITIALIZATION_TIME_OUT_DELAY } from './deflateWorker'

// Arbitrary stream ids used for tests
const TEST_STREAM_ID = 5

describe('startDeflateWorker', () => {
  let mockWorker: MockWorker
  let createDeflateWorkerSpy: jasmine.Spy<CreateDeflateWorker>
  let onInitializationFailureSpy: jasmine.Spy<() => void>
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    mockWorker = new MockWorker()
    onInitializationFailureSpy = jasmine.createSpy('onInitializationFailureSpy')
    createDeflateWorkerSpy = jasmine.createSpy('createDeflateWorkerSpy').and.callFake(() => mockWorker)
  })

  afterEach(() => {
    resetDeflateWorkerState()
  })

  it('creates a deflate worker', () => {
    const worker = startDeflateWorker(configuration, onInitializationFailureSpy, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    expect(worker).toBe(mockWorker)

    mockWorker.processAllMessages()
    expect(onInitializationFailureSpy).not.toHaveBeenCalled()
  })

  it('uses the previously created worker during loading', () => {
    const worker1 = startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
    const worker2 = startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    expect(worker1).toBe(worker2)
  })

  it('uses the previously created worker once initialized', () => {
    const worker1 = startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
    mockWorker.processAllMessages()

    const worker2 = startDeflateWorker(configuration, onInitializationFailureSpy, createDeflateWorkerSpy)
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    expect(worker1).toBe(worker2)

    mockWorker.processAllMessages()
    expect(onInitializationFailureSpy).not.toHaveBeenCalled()
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

    describe('Chrome and Safari behavior: exception during worker creation', () => {
      it('returns undefined when the worker creation throws an exception', () => {
        const worker = startDeflateWorker(configuration, noop, () => {
          throw CSP_ERROR
        })
        expect(worker).toBeUndefined()
      })

      it('displays CSP instructions when the worker creation throws a CSP error', () => {
        startDeflateWorker(configuration, noop, () => {
          throw CSP_ERROR
        })
        expect(displaySpy).toHaveBeenCalledWith(
          jasmine.stringContaining('Please make sure CSP is correctly configured')
        )
      })

      it('does not report CSP errors to telemetry', () => {
        startDeflateWorker(configuration, noop, () => {
          throw CSP_ERROR
        })
        expect(telemetryEvents).toEqual([])
      })

      it('does not try to create a worker again after the creation failed', () => {
        startDeflateWorker(configuration, noop, () => {
          throw CSP_ERROR
        })
        startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
        expect(createDeflateWorkerSpy).not.toHaveBeenCalled()
      })
    })

    describe('Firefox behavior: error during worker loading', () => {
      it('displays ErrorEvent as CSP error', () => {
        startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
        mockWorker.dispatchErrorEvent()
        expect(displaySpy).toHaveBeenCalledWith(
          jasmine.stringContaining('Please make sure CSP is correctly configured')
        )
      })

      it('calls the initialization failure callback when of an error occurs during loading', () => {
        startDeflateWorker(configuration, onInitializationFailureSpy, createDeflateWorkerSpy)
        mockWorker.dispatchErrorEvent()
        expect(onInitializationFailureSpy).toHaveBeenCalledTimes(1)
      })

      it('returns undefined if an error occurred in a previous loading', () => {
        startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
        mockWorker.dispatchErrorEvent()

        const worker = startDeflateWorker(configuration, onInitializationFailureSpy, createDeflateWorkerSpy)

        expect(worker).toBeUndefined()
        expect(onInitializationFailureSpy).not.toHaveBeenCalled()
      })

      it('adjusts the error message when a workerUrl is set', () => {
        configuration.workerUrl = '/worker.js'
        startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
        mockWorker.dispatchErrorEvent()
        expect(displaySpy).toHaveBeenCalledWith(
          jasmine.stringContaining(
            'Please make sure the Worker URL /worker.js is correct and CSP is correctly configured.'
          )
        )
      })

      it('calls all registered callbacks when the worker initialization fails', () => {
        const onInitializationFailureSpy1 = jasmine.createSpy()
        const onInitializationFailureSpy2 = jasmine.createSpy()
        startDeflateWorker(configuration, onInitializationFailureSpy1, createDeflateWorkerSpy)
        startDeflateWorker(configuration, onInitializationFailureSpy2, createDeflateWorkerSpy)
        mockWorker.dispatchErrorEvent()
        expect(onInitializationFailureSpy1).toHaveBeenCalledTimes(1)
        expect(onInitializationFailureSpy2).toHaveBeenCalledTimes(1)
      })
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
      mockWorker.dispatchErrorMessage('foo')
      expect(displaySpy).not.toHaveBeenCalledWith(jasmine.stringContaining('CSP'))
    })

    it('reports errors occurring after loading to telemetry', () => {
      startDeflateWorker(configuration, noop, createDeflateWorkerSpy)
      mockWorker.processAllMessages()

      mockWorker.dispatchErrorMessage('boom', TEST_STREAM_ID)
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
