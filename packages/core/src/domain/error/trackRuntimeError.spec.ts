import { Observable } from '../../tools/observable'
import { collectAsyncCalls } from '../../../test'
import { NO_ERROR_STACK_PRESENT_MESSAGE } from './error'
import { trackRuntimeError } from './trackRuntimeError'
import type { RawError } from './error.types'

describe('trackRuntimeError', () => {
  const ERROR_MESSAGE = 'foo'

  let originalOnErrorHandler: OnErrorEventHandler
  let onErrorSpy: jasmine.Spy

  let originalOnUnhandledRejectionHandler: Window['onunhandledrejection']
  let onUnhandledrejectionSpy: jasmine.Spy

  let notifyError: jasmine.Spy
  let stopRuntimeErrorTracking: () => void

  beforeEach(() => {
    originalOnErrorHandler = window.onerror
    onErrorSpy = jasmine.createSpy()
    window.onerror = onErrorSpy

    originalOnUnhandledRejectionHandler = window.onunhandledrejection
    onUnhandledrejectionSpy = jasmine.createSpy()
    window.onunhandledrejection = onUnhandledrejectionSpy

    notifyError = jasmine.createSpy()
    const errorObservable = new Observable<RawError>()
    errorObservable.subscribe((e: RawError) => notifyError(e) as void)
    ;({ stop: stopRuntimeErrorTracking } = trackRuntimeError(errorObservable))
  })

  afterEach(() => {
    stopRuntimeErrorTracking()
    window.onerror = originalOnErrorHandler
    window.onunhandledrejection = originalOnUnhandledRejectionHandler
  })

  it('should call original error handler', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      expect(onErrorSpy.calls.mostRecent().args[0]).toMatch(ERROR_MESSAGE)
      done()
    })
  })

  it('should call original unhandled rejection handler', () => {
    window.onunhandledrejection!({
      reason: new Error(ERROR_MESSAGE),
    } as PromiseRejectionEvent)

    expect(onUnhandledrejectionSpy.calls.mostRecent().args[0].reason).toMatch(ERROR_MESSAGE)
  })

  it('should notify unhandled error instance', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      const collectedError = notifyError.calls.mostRecent().args[0] as RawError
      expect(collectedError.message).toEqual(ERROR_MESSAGE)
      expect(collectedError.stack).not.toEqual(NO_ERROR_STACK_PRESENT_MESSAGE)
      done()
    })
  })

  it('should notify unhandled string', (done) => {
    setTimeout(() => {
      // eslint-disable-next-line no-throw-literal
      throw 'foo'
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      const collectedError = notifyError.calls.mostRecent().args[0] as RawError
      expect(collectedError.message).toEqual('Uncaught "foo"')
      expect(collectedError.stack).toEqual(NO_ERROR_STACK_PRESENT_MESSAGE)
      done()
    })
  })

  it('should notify unhandled object', (done) => {
    setTimeout(() => {
      // eslint-disable-next-line no-throw-literal
      throw { a: 'foo' }
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      const collectedError = notifyError.calls.mostRecent().args[0] as RawError
      expect(collectedError.message).toEqual('Uncaught {"a":"foo"}')
      expect(collectedError.stack).toEqual(NO_ERROR_STACK_PRESENT_MESSAGE)
      done()
    })
  })

  it('should handle direct onerror calls with objects', (done) => {
    setTimeout(() => {
      window.onerror!({ foo: 'bar' } as any)
    })
    collectAsyncCalls(onErrorSpy, 1, () => {
      const collectedError = notifyError.calls.mostRecent().args[0] as RawError
      expect(collectedError.message).toEqual('Uncaught {"foo":"bar"}')
      expect(collectedError.stack).toEqual(NO_ERROR_STACK_PRESENT_MESSAGE)
      done()
    })
  })
})
