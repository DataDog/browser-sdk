import { clocksNow } from '@datadog/js-core/time'
import { ConsoleApiName, Observable, globalObject, noop } from '@datadog/js-core/util'
import type { MockFetch } from '../../test'
import {
  collectAsyncCalls,
  mockFetch,
  mockXhr,
  registerCleanupTask,
  replaceMockable,
  replaceMockableWithSpy,
  withXhr,
} from '../../test'
import { resetFetchObservable } from '../browser/fetchObservable'
import { resetXhrObservable } from '../browser/xhrObservable'
import { resetConsoleObservable } from './console/consoleObservable'
import type { BufferedData } from './bufferedData'
import { BufferedDataType, startBufferingData } from './bufferedData'
import { ErrorHandling, ErrorSource, type RawError } from './error/error.types'
import { trackRuntimeError } from './error/trackRuntimeError'
import { EARLY_COLLECTION_GLOBAL_NAME } from './earlyCollection/earlyCollection'

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
    // eslint-disable-next-line @typescript-eslint/unbound-method
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
    spyOn(console, 'error').and.callFake(noop)
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

  describe('early collection package', () => {
    function setEarlyCollectionGlobal(overrides: { version?: number } = {}) {
      const earlyCollection = {
        version: 1,
        startClocks: { relative: 1, timeStamp: 2 },
        buffer: [],
        profiler: undefined,
        stop: noop,
        ...overrides,
      }
      ;(globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME] = earlyCollection
      registerCleanupTask(() => {
        delete (globalObject as unknown as Record<string, unknown>)[EARLY_COLLECTION_GLOBAL_NAME]
      })
    }

    it('does not instrument runtime errors when the early collection package is present', () => {
      const trackRuntimeErrorSpy = replaceMockableWithSpy(trackRuntimeError)
      setEarlyCollectionGlobal()

      const { stop } = startBufferingData()
      registerCleanupTask(stop)

      expect(trackRuntimeErrorSpy).not.toHaveBeenCalled()
    })

    it('still instruments runtime errors when the early collection contract version is not recognized', () => {
      const trackRuntimeErrorSpy = replaceMockableWithSpy(trackRuntimeError)
      trackRuntimeErrorSpy.and.returnValue(new Observable<RawError>())
      setEarlyCollectionGlobal({ version: 2 })

      const { stop } = startBufferingData()
      registerCleanupTask(stop)

      expect(trackRuntimeErrorSpy).toHaveBeenCalled()
    })

    it('still collects fetch requests when the early collection package is present', async () => {
      mockFetch()
      setEarlyCollectionGlobal()

      const { observable, stop } = startBufferingData()
      // eslint-disable-next-line @typescript-eslint/unbound-method
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
          data: jasmine.objectContaining({ state: 'start', url: 'http://fake-url/', method: 'GET' }),
        },
        {
          type: BufferedDataType.FETCH,
          data: jasmine.objectContaining({ state: 'resolve', url: 'http://fake-url/', method: 'GET' }),
        },
      ])
    })
  })
})
