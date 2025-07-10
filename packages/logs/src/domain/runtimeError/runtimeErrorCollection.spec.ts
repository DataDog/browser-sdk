import type { BufferedData, RawError } from '@datadog/browser-core'
import { ErrorSource, ErrorHandling, Observable, BufferedDataType, clocksNow } from '@datadog/browser-core'
import { registerCleanupTask } from '../../../../core/test'
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

const RAW_ERROR: RawError = {
  startClocks: clocksNow(),
  source: ErrorSource.SOURCE,
  type: 'Error',
  stack: 'Error: error!',
  handling: ErrorHandling.UNHANDLED,
  causes: undefined,
  fingerprint: undefined,
  message: 'error!',
}

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
      error: RAW_ERROR,
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
      message: 'error!',
      status: StatusType.error,
      origin: ErrorSource.SOURCE,
    })
  })

  it('should send runtime errors with causes', () => {
    const { rawLogsEvents, bufferedDataObservable } = startRuntimeErrorCollectionWithDefaults()

    bufferedDataObservable.notify({
      type: BufferedDataType.RUNTIME_ERROR,
      error: {
        ...RAW_ERROR,
        message: 'High level error',
        causes: [
          {
            message: 'Mid level error',
            type: 'Error',
            stack: 'Error: Mid level error',
            source: ErrorSource.SOURCE,
          },
          {
            message: 'Low level error',
            type: 'TypeError',
            stack: 'TypeError: Low level error',
            source: ErrorSource.SOURCE,
          },
        ],
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
      error: RAW_ERROR,
    })

    expect(rawLogsEvents.length).toEqual(0)
  })

  it('should retrieve dd_context from runtime errors', () => {
    const { rawLogsEvents, bufferedDataObservable } = startRuntimeErrorCollectionWithDefaults()

    bufferedDataObservable.notify({
      type: BufferedDataType.RUNTIME_ERROR,
      error: {
        ...RAW_ERROR,
        context: { foo: 'bar' },
      },
    })

    expect(rawLogsEvents[0].messageContext).toEqual({ foo: 'bar' })
  })
})
