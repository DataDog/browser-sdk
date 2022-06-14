import { ErrorSource } from '@datadog/browser-core'
import type { RawRuntimeLogsEvent } from '../../../rawLogsEvent.types'
import type { LogsConfiguration } from '../../configuration'
import { StatusType } from '../../logger'
import type { RawLogsEventCollectedData } from '../../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { startRuntimeErrorCollection } from './runtimeErrorCollection'

describe('runtime error collection', () => {
  const configuration = { forwardErrorsToLogs: true } as LogsConfiguration
  let lifeCycle: LifeCycle
  let stopRuntimeErrorCollection: () => void
  let rawLogsEvents: Array<RawLogsEventCollectedData<RawRuntimeLogsEvent>>
  let onErrorSpy: jasmine.Spy
  let originalOnErrorHandler: OnErrorEventHandler

  beforeEach(() => {
    originalOnErrorHandler = window.onerror
    onErrorSpy = jasmine.createSpy()
    window.onerror = onErrorSpy
    rawLogsEvents = []
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLogsEvent) =>
      rawLogsEvents.push(rawLogsEvent as RawLogsEventCollectedData<RawRuntimeLogsEvent>)
    )
  })

  afterEach(() => {
    stopRuntimeErrorCollection()
    window.onerror = originalOnErrorHandler
  })

  it('should send runtime errors', (done) => {
    ;({ stop: stopRuntimeErrorCollection } = startRuntimeErrorCollection(configuration, lifeCycle))
    setTimeout(() => {
      throw new Error('error!')
    })

    setTimeout(() => {
      expect(rawLogsEvents[0].rawLogsEvent).toEqual({
        date: jasmine.any(Number),
        error: { origin: ErrorSource.SOURCE, kind: 'Error', stack: jasmine.any(String) },
        message: 'error!',
        status: StatusType.error,
        origin: ErrorSource.SOURCE,
      })
      done()
    }, 10)
  })

  it('should not send runtime errors when forwardErrorsToLogs is false', (done) => {
    ;({ stop: stopRuntimeErrorCollection } = startRuntimeErrorCollection(
      { ...configuration, forwardErrorsToLogs: false },
      lifeCycle
    ))

    setTimeout(() => {
      throw new Error('error!')
    })

    setTimeout(() => {
      expect(rawLogsEvents.length).toEqual(0)
      done()
    }, 10)
  })
})
