import { ErrorSource, Observable, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import type { RawError, RelativeTime, TimeStamp } from '@datadog/browser-core'
import type { LogsConfiguration } from '../../configuration'
import { StatusType } from '../../logger'
import type { RawLogCollectedData } from '../../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { startRuntimeErrorCollection } from './runtimeErrorCollection'

describe('runtime error collection', () => {
  let rawErrorObservable: Observable<RawError>
  let lifeCycle: LifeCycle
  let stopRuntimeErrorCollection: () => void
  let rawLogs: RawLogCollectedData[]

  beforeEach(() => {
    rawLogs = []
    rawErrorObservable = new Observable<RawError>()
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.RAW_LOG_COLLECTED, (rawLog) => rawLogs.push(rawLog))
    ;({ stop: stopRuntimeErrorCollection } = startRuntimeErrorCollection(
      {} as LogsConfiguration,
      lifeCycle,
      rawErrorObservable
    ))
  })

  afterEach(() => {
    stopRuntimeErrorCollection()
    resetExperimentalFeatures()
  })

  it('should send runtime errors', () => {
    rawErrorObservable.notify({
      message: 'error!',
      source: ErrorSource.SOURCE,
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: 'Error',
    })

    expect(rawLogs[0].rawLog).toEqual({
      date: 123456789 as TimeStamp,
      error: { origin: ErrorSource.SOURCE, kind: 'Error', stack: undefined },
      message: 'error!',
      status: StatusType.error,
      origin: undefined,
    })
  })

  it('should send runtime errors with "source" origin when ff forward-logs is enabled', (done) => {
    updateExperimentalFeatures(['forward-logs'])

    rawErrorObservable.notify({
      message: 'error!',
      source: ErrorSource.SOURCE,
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: 'Error',
    })

    expect(rawLogs[0].rawLog.origin).toEqual(ErrorSource.SOURCE)
    done()
  })
})
