import { clocksNow } from '@datadog/js-core/time'
import { ConsoleApiName, Observable, noop } from '@datadog/js-core/util'
import type { MockFetch } from '../../test'
import {
  collectAsyncCalls,
  mockFetch,
  mockXhr,
  registerCleanupTask,
  replaceMockable,
  waitNextMicrotask,
  withXhr,
} from '../../test'
import { resetFetchObservable } from '../browser/fetchObservable'
import { resetXhrObservable } from '../browser/xhrObservable'
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

  describe('console APIs', () => {
    /* eslint-disable no-console */
    let originalConsoleLog: typeof console.log
    let originalConsoleError: typeof console.error

    beforeEach(() => {
      spyOn(console, 'log')
      spyOn(console, 'error')
      originalConsoleLog = console.log
      originalConsoleError = console.error
    })

    async function collectConsoleMessages(observable: ReturnType<typeof startBufferingData>['observable']) {
      const messages: string[] = []
      observable.subscribe((data) => {
        if (data.type === BufferedDataType.CONSOLE) {
          messages.push(data.data.message)
        }
      })
      // buffered data is replayed in a microtask
      await waitNextMicrotask()
      return messages
    }

    it('instruments all console APIs by default', () => {
      const { stop } = startBufferingData()
      registerCleanupTask(stop)

      expect(console.log).not.toBe(originalConsoleLog)
      expect(console.error).not.toBe(originalConsoleError)
    })

    it('only instruments the provided console APIs', async () => {
      const { observable, stop } = startBufferingData([ConsoleApiName.error])
      registerCleanupTask(stop)

      expect(console.log).toBe(originalConsoleLog)

      console.log('not collected')
      console.error('collected')

      expect(await collectConsoleMessages(observable)).toEqual(['collected'])
    })

    it('stops instrumenting the console APIs excluded by restrictConsoleApis', async () => {
      const { observable, restrictConsoleApis, stop } = startBufferingData()
      registerCleanupTask(stop)

      console.log('collected before restriction')
      restrictConsoleApis([ConsoleApiName.error])
      console.log('not collected')
      console.error('collected')

      expect(console.log).toBe(originalConsoleLog)
      expect(await collectConsoleMessages(observable)).toEqual(['collected before restriction', 'collected'])
    })

    it('restores all console APIs on stop after a restriction', () => {
      const { restrictConsoleApis, stop } = startBufferingData()

      restrictConsoleApis([ConsoleApiName.error])
      stop()

      expect(console.log).toBe(originalConsoleLog)
      expect(console.error).toBe(originalConsoleError)
    })

    it('keeps console APIs instrumented while another consumer needs them', async () => {
      const first = startBufferingData([ConsoleApiName.error])
      const second = startBufferingData()
      registerCleanupTask(() => {
        first.stop()
        second.stop()
      })

      second.restrictConsoleApis([])
      console.error('collected')

      expect(console.log).toBe(originalConsoleLog)
      expect(await collectConsoleMessages(first.observable)).toEqual(['collected'])
    })
    /* eslint-enable no-console */
  })
})
