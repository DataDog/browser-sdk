import type { BufferedData, RuntimeError } from '@datadog/browser-core'
import { clocksNow } from '@datadog/js-core/time'
import { ErrorSource, ErrorHandling, BufferedDataType } from '@datadog/browser-core'
import { Observable } from '@datadog/js-core/util'
import { mockSourceCodeContext, registerCleanupTask } from '../../../../browser-core/test'
import type { RawRuntimeLogsEvent } from '../../rawLogsEvent.types'
import type { LogsConfiguration } from '../configuration'
import { StatusType } from '../logger/isAuthorized'
import type { RawLogsEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { startRuntimeErrorCollection } from './runtimeErrorCollection'

function startRuntimeErrorCollectionWithDefaults({
  forwardErrorsToLogs = true,
}: { forwardErrorsToLogs?: boolean } = {}) {
  const rawLogsEvents: Array<RawLogsEventCollectedData<RawRuntimeLogsEvent>> = []
  const lifeCycle = new LifeCycle()
  lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
    rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawRuntimeLogsEvent>)
  )
  const bufferedDataObservable = new Observable<BufferedData>()
  const { stop } = startRuntimeErrorCollection(
    { forwardErrorsToLogs } as LogsConfiguration,
    lifeCycle,
    bufferedDataObservable
  )
  registerCleanupTask(stop)

  return { rawLogsEvents, bufferedDataObservable }
}

const RUNTIME_ERROR: RuntimeError = { startClocks: clocksNow(), originalError: new Error('error!') }

describe('runtime error collection', () => {
  let onErrorSpy: jasmine.Spy
  let originalOnErrorHandler: OnErrorEventHandler

  beforeEach(() => {
    originalOnErrorHandler = window.onerror
    onErrorSpy = jasmine.createSpy()
    window.onerror = onErrorSpy
  })

  afterEach(() => {
    window.onerror = originalOnErrorHandler
  })

  it('should send runtime errors', () => {
    const { rawLogsEvents, bufferedDataObservable } = startRuntimeErrorCollectionWithDefaults()

    bufferedDataObservable.notify({
      type: BufferedDataType.RUNTIME_ERROR,
      data: RUNTIME_ERROR,
    })

    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      date: jasmine.any(Number),
      error: {
        kind: 'Error',
        stack: jasmine.any(String),
        causes: undefined,
        handling: ErrorHandling.UNHANDLED,
        fingerprint: undefined,
        message: undefined,
      },
      _dd: { debug_ids: undefined },
      message: 'error!',
      status: StatusType.error,
      origin: ErrorSource.SOURCE,
    })
  })

  it('should send runtime errors with causes', () => {
    const { rawLogsEvents, bufferedDataObservable } = startRuntimeErrorCollectionWithDefaults()

    bufferedDataObservable.notify({
      type: BufferedDataType.RUNTIME_ERROR,
      data: {
        ...RUNTIME_ERROR,
        originalError: Object.assign(new Error('High level error'), {
          cause: Object.assign(new Error('Mid level error'), { cause: new TypeError('Low level error') }),
        }),
      },
    })

    expect(rawLogsEvents[0].rawLogsEvent).toEqual({
      date: jasmine.any(Number),
      error: {
        kind: 'Error',
        stack: jasmine.any(String),
        handling: ErrorHandling.UNHANDLED,
        causes: [
          {
            source: ErrorSource.SOURCE,
            type: 'Error',
            stack: jasmine.any(String),
            message: 'Mid level error',
          },
          {
            source: ErrorSource.SOURCE,
            type: 'TypeError',
            stack: jasmine.any(String),
            message: 'Low level error',
          },
        ],
        fingerprint: undefined,
        message: undefined,
      },
      _dd: { debug_ids: undefined },
      message: 'High level error',
      status: StatusType.error,
      origin: ErrorSource.SOURCE,
    })
  })

  it('should not send runtime errors when forwardErrorsToLogs is false', () => {
    const { rawLogsEvents, bufferedDataObservable } = startRuntimeErrorCollectionWithDefaults({
      forwardErrorsToLogs: false,
    })

    bufferedDataObservable.notify({
      type: BufferedDataType.RUNTIME_ERROR,
      data: RUNTIME_ERROR,
    })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should attach debug_ids from runtime errors', () => {
    const { rawLogsEvents, bufferedDataObservable } = startRuntimeErrorCollectionWithDefaults()

    const stack = 'Error: error!\n    at fn (http://path/to/debug-id.js:1:2)'
    mockSourceCodeContext({ [stack]: { ddDebugId: '01234567-89ab-cdef-0123-456789abcdef' } })
    bufferedDataObservable.notify({
      type: BufferedDataType.RUNTIME_ERROR,
      data: {
        ...RUNTIME_ERROR,
        originalError: Object.assign(new Error('error!'), { stack }),
      },
    })

    expect(rawLogsEvents[0].rawLogsEvent._dd).toEqual({
      debug_ids: [{ url: 'http://path/to/debug-id.js', id: '01234567-89ab-cdef-0123-456789abcdef' }],
    })
  })

  it('should retrieve dd_context from runtime errors', () => {
    const { rawLogsEvents, bufferedDataObservable } = startRuntimeErrorCollectionWithDefaults()

    bufferedDataObservable.notify({
      type: BufferedDataType.RUNTIME_ERROR,
      data: {
        ...RUNTIME_ERROR,
        originalError: Object.assign(new Error('error!'), { dd_context: { foo: 'bar' } }),
      },
    })

    expect(rawLogsEvents[0].rawLogsEvent).toEqual(jasmine.objectContaining({ foo: 'bar' }))
  })
})
