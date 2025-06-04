import type { ErrorWithCause } from '@datadog/browser-core'
import { ErrorSource, ErrorHandling } from '@datadog/browser-core'
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
  const { stop } = startRuntimeErrorCollection({ forwardErrorsToLogs } as LogsConfiguration, lifeCycle)
  registerCleanupTask(stop)

  return { rawLogsEvents }
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

  it('should send runtime errors', (done) => {
    const { rawLogsEvents } = startRuntimeErrorCollectionWithDefaults()
    setTimeout(() => {
      throw new Error('error!')
    })

    setTimeout(() => {
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
      done()
    }, 10)
  })

  it('should send runtime errors with causes', (done) => {
    const error = new Error('High level error') as ErrorWithCause
    error.stack = 'Error: High level error'

    const nestedError = new Error('Mid level error') as ErrorWithCause
    nestedError.stack = 'Error: Mid level error'

    const deepNestedError = new TypeError('Low level error') as ErrorWithCause
    deepNestedError.stack = 'TypeError: Low level error'

    nestedError.cause = deepNestedError
    error.cause = nestedError
    const { rawLogsEvents } = startRuntimeErrorCollectionWithDefaults()
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw error
    })

    setTimeout(() => {
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
      done()
    }, 10)
  })

  it('should not send runtime errors when forwardErrorsToLogs is false', (done) => {
    const { rawLogsEvents } = startRuntimeErrorCollectionWithDefaults({ forwardErrorsToLogs: false })

    setTimeout(() => {
      throw new Error('error!')
    })

    setTimeout(() => {
      expect(rawLogsEvents.length).toEqual(0)
      done()
    }, 10)
  })

  it('should retrieve dd_context from runtime errors', (done) => {
    interface DatadogError extends Error {
      dd_context?: Record<string, unknown>
    }

    const error = new Error('Error with dd_context') as DatadogError
    error.dd_context = { foo: 'barr' }
    const { rawLogsEvents } = startRuntimeErrorCollectionWithDefaults()
    setTimeout(() => {
      throw error
    })

    setTimeout(() => {
      expect(rawLogsEvents[0].messageContext).toEqual({ foo: 'barr' })
      done()
    }, 10)
  })
})
