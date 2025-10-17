/* eslint-disable no-console */
import { vi } from 'vitest'
import { ignoreConsoleLogs } from '../../../test'
import { ConsoleApiName } from '../../tools/display'
import type { Subscription } from '../../tools/observable'
import type { ErrorConsoleLog } from './consoleObservable'
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
    let consoleSpy: ReturnType<typeof vi.fn>
    let consoleSubscription: Subscription
    let notifyLog: ReturnType<typeof vi.fn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, api)
      notifyLog = vi.fn()

      consoleSubscription = initConsoleObservable([api]).subscribe(notifyLog)
    })

    afterEach(() => {
      consoleSubscription.unsubscribe()
    })

    it(`should notify ${api}`, () => {
      console[api]('foo', 'bar')

      const consoleLog = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0]

      expect(consoleLog).toEqual(
        expect.objectContaining({
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
      const consoleLog = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0]
      expect(consoleLog.message).toBe('TypeError: hello')
    })

    it('should stringify object parameters', () => {
      console[api]('Hello', { foo: 'bar' })
      const consoleLog = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0]
      expect(consoleLog.message).toBe('Hello {\n  "foo": "bar"\n}')
    })

    it('should allow multiple callers', () => {
      const notifyOtherCaller = vi.fn()
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
  let notifyLog: ReturnType<typeof vi.fn<(consoleLog: ErrorConsoleLog) =>> void>

  beforeEach(() => {
    ignoreConsoleLogs('error', 'Error: foo')
    ignoreConsoleLogs('error', 'foo bar')
    notifyLog = vi.fn()

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
    const consoleLog = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0]
    expect(consoleLog.handlingStack).toMatch(/^HandlingStack: console error\s+at triggerError (.|\n)*$/)
  })

  it('should extract stack from first error', () => {
    console.error(new TypeError('foo'), new TypeError('bar'))
    const stack = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0].error.stack
    expect(stack).toContain('TypeError: foo')
  })

  it('should retrieve fingerprint from error', () => {
    interface DatadogError extends Error {
      dd_fingerprint?: string
    }
    const error = new Error('foo')
    ;(error as DatadogError).dd_fingerprint = 'my-fingerprint'

    console.error(error)

    const consoleLog = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0]
    expect(consoleLog.error.fingerprint).toBe('my-fingerprint')
  })

  it('should sanitize error fingerprint', () => {
    const error = new Error('foo')
    ;(error as any).dd_fingerprint = 2

    console.error(error)

    const consoleLog = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0]
    expect(consoleLog.error.fingerprint).toBe('2')
  })

  it('should retrieve context from error', () => {
    interface DatadogError extends Error {
      dd_context?: Record<string, unknown>
    }
    const error = new Error('foo')
    ;(error as DatadogError).dd_context = { foo: 'bar' }
    console.error(error)
    const consoleLog = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0]
    expect(consoleLog.error.context).toEqual({ foo: 'bar' })
  })

  it('should report original error', () => {
    const error = new Error('foo')
    console.error(error)
    const consoleLog = notifyLog.mock.calls[notifyLog.mock.calls.length - 1][0]
    expect(consoleLog.error.originalError).toBe(error)
  })
})
