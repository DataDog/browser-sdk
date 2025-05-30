import type { RawTelemetryEvent } from '@datadog/browser-core'
import { display, resetTelemetry, startFakeTelemetry } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { MockWorker } from '../../../test'
import type { CreateDeflateWorker } from './deflateWorker'
import { startDeflateWorker, resetDeflateWorkerState, INITIALIZATION_TIME_OUT_DELAY } from './deflateWorker'

// Arbitrary stream ids used for tests
const TEST_STREAM_ID = 5

describe('startDeflateWorker', () => {
  let mockWorker: MockWorker
  let createDeflateWorkerSpy: jasmine.Spy<CreateDeflateWorker>
  let onInitializationFailureSpy: jasmine.Spy<() => void>

  function startDeflateWorkerWithDefaults({
    configuration = {},
    source = 'Session Replay',
  }: {
    configuration?: Partial<RumConfiguration>
    source?: string
  } = {}) {
    return startDeflateWorker(
      configuration as RumConfiguration,
      source,
      onInitializationFailureSpy,
      createDeflateWorkerSpy
    )
  }

  beforeEach(() => {
    mockWorker = new MockWorker()
    onInitializationFailureSpy = jasmine.createSpy('onInitializationFailureSpy')
    createDeflateWorkerSpy = jasmine.createSpy('createDeflateWorkerSpy').and.callFake(() => mockWorker)
  })

  afterEach(() => {
    resetDeflateWorkerState()
  })

  it('creates a deflate worker', () => {
    const worker = startDeflateWorkerWithDefaults()
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    expect(worker).toBe(mockWorker)

    mockWorker.processAllMessages()
    expect(onInitializationFailureSpy).not.toHaveBeenCalled()
  })

  it('uses the previously created worker during loading', () => {
    const worker1 = startDeflateWorkerWithDefaults()
    const worker2 = startDeflateWorkerWithDefaults()
    expect(createDeflateWorkerSpy).toHaveBeenCalledTimes(1)
    expect(worker1).toBe(worker2)
  })

  it('uses the previously created worker once initialized', () => {
    const worker1 = startDeflateWorkerWithDefaults()
    mockWorker.processAllMessages()

    const worker2 = startDeflateWorkerWithDefaults()
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

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      telemetryEvents = startFakeTelemetry()
      CSP_ERROR = new DOMException(
        "Failed to construct 'Worker': Access to the script at 'blob:https://example.org/9aadbb61-effe-41ee-aa76-fc607053d642' is denied by the document's Content Security Policy."
      )

      registerCleanupTask(() => {
        resetTelemetry()
      })
    })

    describe('Chrome and Safari behavior: exception during worker creation', () => {
      it('returns undefined when the worker creation throws an exception', () => {
        createDeflateWorkerSpy.and.throwError(CSP_ERROR)
        const worker = startDeflateWorkerWithDefaults()
        expect(worker).toBeUndefined()
      })

      it('displays CSP instructions when the worker creation throws a CSP error', () => {
        createDeflateWorkerSpy.and.throwError(CSP_ERROR)
        startDeflateWorkerWithDefaults()
        expect(displaySpy).toHaveBeenCalledWith(
          jasmine.stringContaining('Please make sure CSP is correctly configured')
        )
      })

      it('does not report CSP errors to telemetry', () => {
        createDeflateWorkerSpy.and.throwError(CSP_ERROR)
        startDeflateWorkerWithDefaults()
        expect(telemetryEvents).toEqual([])
      })

      it('does not try to create a worker again after the creation failed', () => {
        createDeflateWorkerSpy.and.throwError(CSP_ERROR)
        startDeflateWorkerWithDefaults()
        createDeflateWorkerSpy.calls.reset()
        startDeflateWorkerWithDefaults()
        expect(createDeflateWorkerSpy).not.toHaveBeenCalled()
      })
    })

    describe('Firefox behavior: error during worker loading', () => {
      it('displays ErrorEvent as CSP error', () => {
        startDeflateWorkerWithDefaults()
        mockWorker.dispatchErrorEvent()
        expect(displaySpy).toHaveBeenCalledWith(
          jasmine.stringContaining('Please make sure CSP is correctly configured')
        )
      })

      it('calls the initialization failure callback when of an error occurs during loading', () => {
        startDeflateWorkerWithDefaults()
        mockWorker.dispatchErrorEvent()
        expect(onInitializationFailureSpy).toHaveBeenCalledTimes(1)
      })

      it('returns undefined if an error occurred in a previous loading', () => {
        startDeflateWorkerWithDefaults()
        mockWorker.dispatchErrorEvent()
        onInitializationFailureSpy.calls.reset()

        const worker = startDeflateWorkerWithDefaults()

        expect(worker).toBeUndefined()
        expect(onInitializationFailureSpy).not.toHaveBeenCalled()
      })

      it('adjusts the error message when a workerUrl is set', () => {
        startDeflateWorkerWithDefaults({
          configuration: {
            workerUrl: '/worker.js',
          },
        })
        mockWorker.dispatchErrorEvent()
        expect(displaySpy).toHaveBeenCalledWith(
          jasmine.stringContaining(
            'Please make sure the worker URL /worker.js is correct and CSP is correctly configured.'
          )
        )
      })

      it('calls all registered callbacks when the worker initialization fails', () => {
        startDeflateWorkerWithDefaults()
        startDeflateWorkerWithDefaults()
        mockWorker.dispatchErrorEvent()
        expect(onInitializationFailureSpy).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('initialization timeout', () => {
    let displaySpy: jasmine.Spy
    let clock: Clock

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      createDeflateWorkerSpy.and.callFake(
        () =>
          // Creates a worker that does nothing
          new Worker(URL.createObjectURL(new Blob([''])))
      )
      clock = mockClock()
    })

    it('displays an error message when the worker does not respond to the init action', () => {
      startDeflateWorkerWithDefaults()
      clock.tick(INITIALIZATION_TIME_OUT_DELAY)
      expect(displaySpy).toHaveBeenCalledOnceWith(
        'Session Replay failed to start: a timeout occurred while initializing the Worker'
      )
    })

    it('displays a customized error message', () => {
      startDeflateWorkerWithDefaults({ source: 'Foo' })
      clock.tick(INITIALIZATION_TIME_OUT_DELAY)
      expect(displaySpy).toHaveBeenCalledOnceWith(
        'Foo failed to start: a timeout occurred while initializing the Worker'
      )
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
      createDeflateWorkerSpy.and.throwError(UNKNOWN_ERROR)
      startDeflateWorkerWithDefaults()
      expect(displaySpy).toHaveBeenCalledOnceWith(
        'Session Replay failed to start: an error occurred while initializing the worker:',
        UNKNOWN_ERROR
      )
    })

    it('displays a customized error message', () => {
      createDeflateWorkerSpy.and.throwError(UNKNOWN_ERROR)
      startDeflateWorkerWithDefaults({ source: 'Foo' })
      expect(displaySpy).toHaveBeenCalledOnceWith(
        'Foo failed to start: an error occurred while initializing the worker:',
        UNKNOWN_ERROR
      )
    })

    it('reports unknown errors to telemetry', () => {
      createDeflateWorkerSpy.and.throwError(UNKNOWN_ERROR)
      startDeflateWorkerWithDefaults()
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
      startDeflateWorkerWithDefaults()
      mockWorker.dispatchErrorMessage('foo')
      expect(displaySpy).not.toHaveBeenCalledWith(jasmine.stringContaining('CSP'))
    })

    it('reports errors occurring after loading to telemetry', () => {
      startDeflateWorkerWithDefaults()
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
