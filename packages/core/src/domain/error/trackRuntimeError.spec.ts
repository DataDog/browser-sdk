import type { RawError } from '../../tools/error'
import { Observable } from '../../tools/observable'
import { trackRuntimeError } from './trackRuntimeError'

describe('runtime error tracker', () => {
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
    }, 10)

    setTimeout(() => {
      expect(onErrorSpy.calls.mostRecent().args[0]).toMatch(ERROR_MESSAGE)
      done()
    }, 100)
  })

  it('should call original unhandled rejection handler', () => {
    window.onunhandledrejection!({
      reason: new Error(ERROR_MESSAGE),
    } as PromiseRejectionEvent)

    expect(onUnhandledrejectionSpy.calls.mostRecent().args[0].reason).toMatch(ERROR_MESSAGE)
  })

  it('should notify error', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect((notifyError.calls.mostRecent().args[0] as RawError).message).toEqual(ERROR_MESSAGE)
      done()
    }, 100)
  })

  it('should handle direct onerror calls with objects', (done) => {
    setTimeout(() => {
      window.onerror!({ foo: 'bar' } as any)
    }, 10)

    setTimeout(() => {
      const collectedError = notifyError.calls.mostRecent().args[0] as RawError
      expect(collectedError.message).toEqual('Uncaught {"foo":"bar"}')
      expect(collectedError.stack).toEqual('No stack, consider using an instance of Error')
      done()
    }, 100)
  })
})
