/* eslint-disable no-console */
import { isIE } from '../tools/browserDetection'
import type { Subscription } from '../tools/observable'
import type { ConsoleLog } from './consoleObservable'
import { ConsoleApiName, initConsoleObservable } from './consoleObservable'

// prettier: avoid formatting issue
// cf https://github.com/prettier/prettier/issues/12211
;[ConsoleApiName.log, ConsoleApiName.info, ConsoleApiName.warn, ConsoleApiName.debug, ConsoleApiName.error].forEach(
  (apiName) => {
    describe(`console ${apiName} observable`, () => {
      let consoleStub: jasmine.Spy
      let consoleSubscription: Subscription
      let notifyLog: jasmine.Spy

      beforeEach(() => {
        consoleStub = spyOn(console, apiName)
        notifyLog = jasmine.createSpy('notifyLog')

        consoleSubscription = initConsoleObservable([apiName]).subscribe(notifyLog)
      })

      afterEach(() => {
        consoleSubscription.unsubscribe()
      })

      it(`should notify ${apiName}`, () => {
        console[apiName]('foo', 'bar')

        const consoleLog = notifyLog.calls.mostRecent().args[0]

        expect(consoleLog).toEqual(
          jasmine.objectContaining({
            message: `console ${apiName}: foo bar`,
            apiName,
          })
        )
      })

      it('should keep original behavior', () => {
        console[apiName]('foo', 'bar')

        expect(consoleStub).toHaveBeenCalledWith('foo', 'bar')
      })

      it('should format error instance', () => {
        console[apiName](new TypeError('hello'))
        const consoleLog = notifyLog.calls.mostRecent().args[0]
        expect(consoleLog.message).toBe(`console ${apiName}: TypeError: hello`)
      })

      it('should stringify object parameters', () => {
        console[apiName]('Hello', { foo: 'bar' })
        const consoleLog = notifyLog.calls.mostRecent().args[0]
        expect(consoleLog.message).toBe(`console ${apiName}: Hello {\n  "foo": "bar"\n}`)
      })

      it('should allow multiple callers', () => {
        const notifyOtherCaller = jasmine.createSpy('notifyOtherCaller')
        const otherConsoleSubscription = initConsoleObservable([apiName]).subscribe(notifyOtherCaller)

        console[apiName]('foo', 'bar')

        expect(notifyLog).toHaveBeenCalledTimes(1)
        expect(notifyOtherCaller).toHaveBeenCalledTimes(1)

        otherConsoleSubscription.unsubscribe()
      })
    })
  }
)

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
