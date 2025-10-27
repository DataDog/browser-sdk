import { registerCleanupTask } from '../../test'
import { Observable } from '../tools/observable'
import { clocksNow } from '../tools/utils/timeUtils'
import { BufferedDataType, startBufferingData } from './bufferedData'
import { ErrorHandling, ErrorSource, type RawError } from './error/error.types'

describe('startBufferingData', () => {
  it('collects runtime errors', (done) => {
    const runtimeErrorObservable = new Observable<RawError>()
    const { observable, stop } = startBufferingData(() => runtimeErrorObservable)
    registerCleanupTask(stop)

    const rawError = {
      startClocks: clocksNow(),
      source: ErrorSource.SOURCE,
      type: 'Error',
      stack: 'Error: error!',
      handling: ErrorHandling.UNHANDLED,
      causes: undefined,
      fingerprint: undefined,
      message: 'error!',
    }

    runtimeErrorObservable.notify(rawError)

    observable.subscribe((data) => {
      expect(data).toEqual({
        type: BufferedDataType.RUNTIME_ERROR,
        error: rawError,
      })
      done()
    })
  })
})
