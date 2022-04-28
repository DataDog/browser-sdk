/* eslint-disable no-console */
import { isIE } from '../../tools/browserDetection'
import type { Subscription } from '../../tools/observable'
import type { ConsoleLog } from './consoleObservable'
import { ConsoleApiName, initConsoleObservable } from './consoleObservable'

// prettier: avoid formatting issue
// cf https://github.com/prettier/prettier/issues/12211
;[
  { api: ConsoleApiName.log, prefix: '' },
  { api: ConsoleApiName.info, prefix: '' },
  { api: ConsoleApiName.warn, prefix: '' },
  { api: ConsoleApiName.debug, prefix: '' },
  { api: ConsoleApiName.error, prefix: 'console error: ' },
].forEach(({ api, prefix }) => {
  describe(`console ${api} observable`, () => {
    let consoleStub: jasmine.Spy
    let consoleSubscription: Subscription
    let notifyLog: jasmine.Spy

    beforeEach(() => {
      consoleStub = spyOn(console, api)
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
          message: `${prefix}foo bar`,
          api,
        })
      )
    })

    it('should keep original behavior', () => {
      console[api]('foo', 'bar')

      expect(consoleStub).toHaveBeenCalledWith('foo', 'bar')
    })

    it('should format error instance', () => {
      console[api](new TypeError('hello'))
      const consoleLog = notifyLog.calls.mostRecent().args[0]
      expect(consoleLog.message).toBe(`${prefix}TypeError: hello`)
    })

    it('should stringify object parameters', () => {
      console[api]('Hello', { foo: 'bar' })
      const consoleLog = notifyLog.calls.mostRecent().args[0]
      expect(consoleLog.message).toBe(`${prefix}Hello {\n  "foo": "bar"\n}`)
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
    if (!isIE()) {
      expect(stack).toMatch(/^TypeError: foo\s+at/)
    } else {
      expect(stack).toContain('TypeError: foo')
    }
  })
})
