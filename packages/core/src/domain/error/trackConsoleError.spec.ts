import { isIE } from '../../../test/specHelper'
import { ErrorHandling, ErrorSource, RawError } from '../../tools/error'
import { Observable } from '../../tools/observable'
import { trackConsoleError, resetConsoleErrorProxy } from './trackConsoleError'

/* eslint-disable no-console */
describe('console tracker', () => {
  let consoleErrorStub: jasmine.Spy
  let notifyError: jasmine.Spy
  const CONSOLE_CONTEXT = {
    source: ErrorSource.CONSOLE,
  }

  beforeEach(() => {
    consoleErrorStub = spyOn(console, 'error')
    notifyError = jasmine.createSpy('notifyError')
    const errorObservable = new Observable<RawError>()
    errorObservable.subscribe(notifyError)
    trackConsoleError(errorObservable)
  })

  afterEach(() => {
    resetConsoleErrorProxy()
  })

  it('should keep original behavior', () => {
    console.error('foo', 'bar')
    expect(consoleErrorStub).toHaveBeenCalledWith('foo', 'bar')
  })

  it('should notify error', () => {
    console.error('foo', 'bar')
    expect(notifyError).toHaveBeenCalledWith({
      ...CONSOLE_CONTEXT,
      message: 'console error: foo bar',
      stack: undefined,
      handlingStack: jasmine.any(String),
      startClocks: jasmine.any(Object),
      handling: ErrorHandling.HANDLED,
    })
  })

  it('should generate a handling stack', () => {
    function triggerError() {
      console.error('foo', 'bar')
    }
    triggerError()
    const rawError = notifyError.calls.mostRecent().args[0] as RawError
    expect(rawError.handlingStack).toMatch(/^Error:\s+at triggerError (.|\n)*$/)
  })

  it('should stringify object parameters', () => {
    console.error('Hello', { foo: 'bar' })
    expect(notifyError).toHaveBeenCalledWith({
      ...CONSOLE_CONTEXT,
      message: 'console error: Hello {\n  "foo": "bar"\n}',
      stack: undefined,
      handlingStack: jasmine.any(String),
      startClocks: jasmine.any(Object),
      handling: ErrorHandling.HANDLED,
    })
  })

  it('should format error instance', () => {
    console.error(new TypeError('hello'))
    expect((notifyError.calls.mostRecent().args[0] as RawError).message).toBe('console error: TypeError: hello')
  })

  it('should extract stack from first error', () => {
    console.error(new TypeError('foo'), new TypeError('bar'))
    const stack = (notifyError.calls.mostRecent().args[0] as RawError).stack
    if (!isIE()) {
      expect(stack).toMatch(/^TypeError: foo\s+at/)
    } else {
      expect(stack).toContain('TypeError: foo')
    }
  })

  it('should allow multiple callers', () => {
    const notifyOtherCaller = jasmine.createSpy('notifyOtherCaller')
    const otherObservable = new Observable<RawError>()
    otherObservable.subscribe(notifyOtherCaller)
    trackConsoleError(otherObservable)

    console.error('foo', 'bar')

    expect(notifyError).toHaveBeenCalledTimes(1)
    expect(notifyOtherCaller).toHaveBeenCalledTimes(1)
  })
})
