/* eslint-disable no-console */
import { ConsoleApiName } from '../../tools/display'
import type { Subscription } from '../../tools/observable'
import type { ConsoleLog } from './consoleObservable'
import { initConsoleObservable } from './consoleObservable'

// prettier: avoid formatting issue
// cf https://github.com/prettier/prettier/issues/12211
;[
  { api: ConsoleApiName.log },
  { api: ConsoleApiName.info },
  { api: ConsoleApiName.warn },
  { api: ConsoleApiName.debug },
  { api: ConsoleApiName.error },
].forEach(({ api }) => {
  describe(`console ${api} observable`, () => {
    let consoleSpy: jasmine.Spy
    let consoleSubscription: Subscription
    let notifyLog: jasmine.Spy

    beforeEach(() => {
      consoleSpy = spyOn(console, api)
      notifyLog = jasmine.createSpy('notifyLog')

      consoleSubscription = initConsoleObservable([api]).subscribe(notifyLog)
    })

    afterEach(() => {
      consoleSubscription.unsubscribe()
    })

    it(`should notify ${api}`, () => {
      console[api]('foo', 'bar')

      const consoleLog = notifyLog.calls.mostRecent().args[0]

      expect(consoleLog).toEqual(
        jasmine.objectContaining({
          message: 'foo bar',
          api,
        })
      )
    })

    it('should keep original behavior', () => {
      console[api]('foo', 'bar')

      expect(consoleSpy).toHaveBeenCalledWith('foo', 'bar')
    })

    it('should format error instance', () => {
      console[api](new TypeError('hello'))
      const consoleLog = notifyLog.calls.mostRecent().args[0]
      expect(consoleLog.message).toBe('TypeError: hello')
    })

    it('should stringify object parameters', () => {
      console[api]('Hello', { foo: 'bar' })
      const consoleLog = notifyLog.calls.mostRecent().args[0]
      expect(consoleLog.message).toBe('Hello {\n  "foo": "bar"\n}')
    })

    it('should allow multiple callers', () => {
      const notifyOtherCaller = jasmine.createSpy('notifyOtherCaller')
      const instrumentedConsoleApi = console[api]
      const otherConsoleSubscription = initConsoleObservable([api]).subscribe(notifyOtherCaller)

      console[api]('foo', 'bar')

      expect(instrumentedConsoleApi).toEqual(console[api])
      expect(notifyLog).toHaveBeenCalledTimes(1)
      expect(notifyOtherCaller).toHaveBeenCalledTimes(1)

      otherConsoleSubscription.unsubscribe()
    })
  })
})

describe('console error observable', () => {
  let consoleSubscription: Subscription
  let notifyLog: jasmine.Spy

  beforeEach(() => {
    spyOn(console, 'error').and.callFake(() => true)
    notifyLog = jasmine.createSpy('notifyLog')

    consoleSubscription = initConsoleObservable([ConsoleApiName.error]).subscribe(notifyLog)
  })

  afterEach(() => {
    consoleSubscription.unsubscribe()
  })

  it('should generate a handling stack', () => {
    function triggerError() {
      console.error('foo', 'bar')
    }
    triggerError()
    const consoleLog = notifyLog.calls.mostRecent().args[0]
    expect(consoleLog.handlingStack).toMatch(/^Error:\s+at triggerError (.|\n)*$/)
  })

  it('should extract stack from first error', () => {
    console.error(new TypeError('foo'), new TypeError('bar'))
    const stack = (notifyLog.calls.mostRecent().args[0] as ConsoleLog).stack
    expect(stack).toContain('TypeError: foo')
  })

  it('should retrieve fingerprint from error', () => {
    interface DatadogError extends Error {
      dd_fingerprint?: string
    }
    const error = new Error('foo')
    ;(error as DatadogError).dd_fingerprint = 'my-fingerprint'

    // eslint-disable-next-line no-console
    console.error(error)

    const consoleLog = notifyLog.calls.mostRecent().args[0]
    expect(consoleLog.fingerprint).toBe('my-fingerprint')
  })

  it('should sanitize error fingerprint', () => {
    const error = new Error('foo')
    ;(error as any).dd_fingerprint = 2

    // eslint-disable-next-line no-console
    console.error(error)

    const consoleLog = notifyLog.calls.mostRecent().args[0]
    expect(consoleLog.fingerprint).toBe('2')
  })
})
