import { ErrorSource } from '@datadog/browser-core'
import { StatusType } from '../logger'
import type { RawLogsEventCollectedData } from '../lifeCycle'
import type { LogsSpecInjector } from '../../../test/logsSpecInjector'
import { createLogsSpecInjector, startRawLogEvents } from '../../../test/logsSpecInjector'
import { startRuntimeErrorCollection } from './runtimeErrorCollection'

describe('runtime error collection', () => {
  let injector: LogsSpecInjector
  let rawLogsEvents: RawLogsEventCollectedData[]
  let onErrorSpy: jasmine.Spy
  let originalOnErrorHandler: OnErrorEventHandler

  beforeEach(() => {
    originalOnErrorHandler = window.onerror
    onErrorSpy = jasmine.createSpy()
    window.onerror = onErrorSpy
    injector = createLogsSpecInjector()
    rawLogsEvents = injector.run(startRawLogEvents)
  })

  afterEach(() => {
    window.onerror = originalOnErrorHandler
  })

  it('should send runtime errors', (done) => {
    injector.withConfiguration({ forwardErrorsToLogs: true })
    injector.run(startRuntimeErrorCollection)

    setTimeout(() => {
      throw new Error('error!')
    })

    setTimeout(() => {
      expect(rawLogsEvents[0].rawLogsEvent).toEqual({
        date: jasmine.any(Number),
        error: { kind: 'Error', stack: jasmine.any(String) },
        message: 'error!',
        status: StatusType.error,
        origin: ErrorSource.SOURCE,
      })
      done()
    }, 10)
  })

  it('should not send runtime errors when forwardErrorsToLogs is false', (done) => {
    injector.withConfiguration({ forwardErrorsToLogs: false })
    injector.run(startRuntimeErrorCollection)

    setTimeout(() => {
      throw new Error('error!')
    })

    setTimeout(() => {
      expect(rawLogsEvents.length).toEqual(0)
      done()
    }, 10)
  })
})
