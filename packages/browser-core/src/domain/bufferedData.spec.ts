import { clocksNow } from '@datadog/js-core/time'
import { ConsoleApiName, Observable, noop, globalConsole } from '@datadog/js-core/util'
import { createDataBuffer } from '../../../browser-rum-buffer/src/entries/main'
import type { MockFetch } from '../../test'
import {
  collectAsyncCalls,
  mockFetch,
  mockXhr,
  registerCleanupTask,
  replaceMockable,
  replaceMockableWithSpy,
  waitNextMicrotask,
  withXhr,
} from '../../test'
import { resetFetchObservable } from '../browser/fetchObservable'
import { resetXhrObservable } from '../browser/xhrObservable'
import { resetConsoleObservable } from './console/consoleObservable'
import type { BufferedData } from './bufferedData'
import { BufferedDataType, startBufferingData } from './bufferedData'
import type { RuntimeError } from './error/trackRuntimeError'
import { trackRuntimeError } from './error/trackRuntimeError'

describe('startBufferingData', () => {
  it('adopts multiple buffered data types without installing their collectors', async () => {
    const defaultCollector = replaceMockableWithSpy(trackRuntimeError).and.returnValue(new Observable<RuntimeError>())
    const source = createDataBuffer()
    source.subscribe(BufferedDataType.CONSOLE, () => new Observable())
    const unbuffer = spyOn(source.observable, 'unbuffer').and.callThrough()
    const stopSource = spyOn(source, 'stop').and.callThrough()
    const earlyError: RuntimeError = { startClocks: clocksNow(), originalError: 'early' }
    const earlyData: BufferedData = { type: BufferedDataType.RUNTIME_ERROR, data: earlyError }
    const earlyLog: BufferedData = {
      type: BufferedDataType.CONSOLE,
      data: { api: ConsoleApiName.log, message: 'early log', handlingStack: '', error: undefined },
    }
    source.observable.notify(earlyData)
    source.observable.notify(earlyLog)

    const originalConsoleLog = globalConsole.log
    const buffer = startBufferingData(source)
    registerCleanupTask(buffer.stop)
    expect(buffer).toBe(source)
    expect(buffer.observable).toBe(source.observable)
    await waitNextMicrotask()
    expect(unbuffer).not.toHaveBeenCalled()
    const received: BufferedData[] = []
    buffer.observable.subscribe((value) => received.push(value))
    buffer.observable.unbuffer()
    await waitNextMicrotask()
    expect(defaultCollector).toHaveBeenCalledTimes(1)
    expect(received).toEqual([earlyData, earlyLog])
    expect(globalConsole.log).toBe(originalConsoleLog)
    expect(received[0].data).toBe(earlyError)
    source.observable.notify(earlyData)
    expect(received.length).toBe(3)
    buffer.stop()
    expect(stopSource).toHaveBeenCalled()
  })

  it('collects runtime errors', (done) => {
    const runtimeErrorObservable = new Observable<RuntimeError>()
    replaceMockable(trackRuntimeError, () => runtimeErrorObservable)
    const { observable, stop } = startBufferingData(createDataBuffer())
    registerCleanupTask(stop)

    const rawError = { startClocks: clocksNow(), originalError: new Error('error!') }

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
    const { observable, stop } = startBufferingData(createDataBuffer())
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
    const { observable, stop } = startBufferingData(createDataBuffer())
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
    const { observable, stop } = startBufferingData(createDataBuffer())

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
