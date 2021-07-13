import { RawError } from '../../tools/error'
import { Observable } from '../../tools/observable'
import { trackRuntimeError } from './trackRuntimeError'

describe('runtime error tracker', () => {
  const ERROR_MESSAGE = 'foo'
  let originalHandler: OnErrorEventHandler
  let notifyError: jasmine.Spy
  let onerrorSpy: jasmine.Spy
  let stopRuntimeErrorTracking: () => void

  beforeEach(() => {
    originalHandler = window.onerror
    onerrorSpy = jasmine.createSpy()
    window.onerror = onerrorSpy

    notifyError = jasmine.createSpy()
    const errorObservable = new Observable<RawError>()
    errorObservable.subscribe((e: RawError) => notifyError(e) as void)
    ;({ stop: stopRuntimeErrorTracking } = trackRuntimeError(errorObservable))
  })

  afterEach(() => {
    stopRuntimeErrorTracking()
    window.onerror = originalHandler
  })

  it('should call original error handler', (done) => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE)
    }, 10)

    setTimeout(() => {
      expect(onerrorSpy.calls.mostRecent().args[0]).toMatch(ERROR_MESSAGE)
      done()
    }, 100)
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
