import type { MockFetch } from '../../test'
import { collectAsyncCalls, mockFetch, mockXhr, registerCleanupTask, replaceMockable, withXhr } from '../../test'
import { Observable } from '../tools/observable'
import { resetFetchObservable } from '../browser/fetchObservable'
import { resetXhrObservable } from '../browser/xhrObservable'
import { clocksNow } from '../tools/utils/timeUtils'
import { ConsoleApiName } from '../tools/display'
import { noop } from '../tools/utils/functionUtils'
import { resetConsoleObservable } from './console/consoleObservable'
import type { BufferedData } from './bufferedData'
import { BufferedDataType, startBufferingData } from './bufferedData'
import { ErrorHandling, ErrorSource, type RawError } from './error/error.types'
import { trackRuntimeError } from './error/trackRuntimeError'

describe('startBufferingData', () => {
  it('collects runtime errors', (done) => {
    const runtimeErrorObservable = new Observable<RawError>()
    replaceMockable(trackRuntimeError, () => runtimeErrorObservable)
    const { observable, stop } = startBufferingData()
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
        data: rawError,
      })
      done()
    })
  })

  it('collects fetch requests', async () => {
    mockFetch()
    const { observable, stop } = startBufferingData()
    const fetch = window.fetch as MockFetch
    const collected: BufferedData[] = []
    const bufferedDataCollectedSpy = jasmine.createSpy()

    registerCleanupTask(() => {
      stop()
      resetFetchObservable()
    })

    observable.subscribe((data) => {
      if (data.type === BufferedDataType.FETCH) {
        collected.push(data)
        bufferedDataCollectedSpy()
      }
    })

    fetch('http://fake-url/').resolveWith({ status: 200, responseText: 'ok' })

    await collectAsyncCalls(bufferedDataCollectedSpy, 2)

    expect(collected).toEqual([
      {
        type: BufferedDataType.FETCH,
        data: jasmine.objectContaining({
          state: 'start',
          url: 'http://fake-url/',
          method: 'GET',
        }),
      },
      {
        type: BufferedDataType.FETCH,
        data: jasmine.objectContaining({
          state: 'resolve',
          url: 'http://fake-url/',
          method: 'GET',
          status: 200,
        }),
      },
    ])
  })

  it('collects xhr requests', async () => {
    mockXhr()
    const { observable, stop } = startBufferingData()
    const collected: BufferedData[] = []
    const bufferedDataCollectedSpy = jasmine.createSpy()

    registerCleanupTask(() => {
      stop()
      resetXhrObservable()
    })

    withXhr({
      setup(xhr) {
        xhr.open('GET', 'http://fake-url/')
        xhr.send()
        xhr.complete(200, 'ok')
      },
      onComplete: noop,
    })

    observable.subscribe((data) => {
      if (data.type === BufferedDataType.XHR) {
        collected.push(data)
        bufferedDataCollectedSpy()
      }
    })

    await collectAsyncCalls(bufferedDataCollectedSpy, 2)

    expect(collected).toEqual([
      {
        type: BufferedDataType.XHR,
        data: jasmine.objectContaining({
          state: 'start',
          url: 'http://fake-url/',
          method: 'GET',
        }),
      },
      {
        type: BufferedDataType.XHR,
        data: jasmine.objectContaining({
          state: 'complete',
          url: 'http://fake-url/',
          method: 'GET',
          status: 200,
        }),
      },
    ])
  })

  it('collects console logs', (done) => {
    const { observable, stop } = startBufferingData()

    registerCleanupTask(() => {
      stop()
      resetConsoleObservable()
    })

    observable.subscribe((data) => {
      if (data.type === BufferedDataType.CONSOLE && data.data.api === ConsoleApiName.error) {
        expect(data.data.message).toContain('buffered data test error')
        done()
      }
    })

    /* eslint-disable no-console */
    console.error('buffered data test error')
    /* eslint-enable no-console */
  })
})
