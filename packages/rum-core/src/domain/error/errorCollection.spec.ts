import type { RelativeTime, TimeStamp, ErrorWithCause } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource, NO_ERROR_STACK_PRESENT_MESSAGE } from '@datadog/browser-core'
import { FAKE_CSP_VIOLATION_EVENT } from '@datadog/browser-core/test'
import { collectAndValidateRawRumEvents } from '../../../test'
import type { RawRumErrorEvent, RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { doStartErrorCollection } from './errorCollection'

describe('error collection', () => {
  let lifeCycle: LifeCycle
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  let addError: ReturnType<typeof doStartErrorCollection>['addError']

  function setupErrorCollection() {
    lifeCycle = new LifeCycle()
    ;({ addError } = doStartErrorCollection(lifeCycle))

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  }

  // when calling toString on SubErrorViaPrototype, the results will be '[object Object]'
  // but the value of 'error instanceof Error' will still be true.
  function SubErrorViaPrototype(this: Error, _message: string) {
    Error.call(this, _message)
    this.name = 'Error'
    this.message = _message
    this.stack = `Error: ${_message}\n    at <anonymous>`
  }
  SubErrorViaPrototype.prototype = Object.create(Error.prototype)
  SubErrorViaPrototype.prototype.constructor = SubErrorViaPrototype

  describe('addError', () => {
    ;[
      {
        testCase: 'an error instance',
        error: new Error('foo'),
        message: 'foo',
        type: 'Error',
        stack: jasmine.stringMatching('Error: foo'),
      },
      {
        testCase: 'an error subclass via prototype',
        error: new (SubErrorViaPrototype as unknown as { new (message: string): Error })('bar'),
        message: 'bar',
        type: 'Error',
        stack: jasmine.stringMatching('Error: bar'),
      },
      {
        testCase: 'a string',
        error: 'foo',
        message: 'Provided "foo"',
        type: undefined,
        stack: NO_ERROR_STACK_PRESENT_MESSAGE,
      },
      {
        testCase: 'an object',
        error: { a: 'foo' },
        message: 'Provided {"a":"foo"}',
        type: undefined,
        stack: NO_ERROR_STACK_PRESENT_MESSAGE,
      },
    ].forEach(({ testCase, error, message, type, stack }) => {
      it(`notifies a raw rum error event from ${testCase}`, () => {
        setupErrorCollection()

        addError({
          error,
          handlingStack: 'Error: handling foo',
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        })

        expect(rawRumEvents.length).toBe(1)
        expect(rawRumEvents[0]).toEqual({
          customerContext: undefined,
          rawRumEvent: {
            date: jasmine.any(Number),
            error: {
              id: jasmine.any(String),
              message,
              source: ErrorSource.CUSTOM,
              stack,
              handling_stack: 'Error: handling foo',
              component_stack: undefined,
              type,
              handling: ErrorHandling.HANDLED,
              source_type: 'browser',
              causes: undefined,
              fingerprint: undefined,
              csp: undefined,
            },
            type: RumEventType.ERROR,
          },
          savedCommonContext: undefined,
          startTime: 1234 as RelativeTime,
          domainContext: {
            error,
            handlingStack: 'Error: handling foo',
          },
        })
      })
    })

    it('should extract causes from error', () => {
      setupErrorCollection()
      const error1 = new Error('foo') as ErrorWithCause
      const error2 = new Error('bar') as ErrorWithCause
      const error3 = new Error('biz') as ErrorWithCause

      error1.cause = error2
      error2.cause = error3

      addError({
        error: error1,
        handlingStack: 'Error: handling foo',
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      })
      const { error } = rawRumEvents[0].rawRumEvent as RawRumErrorEvent
      expect(error.message).toEqual('foo')
      expect(error.source).toEqual(ErrorSource.CUSTOM)

      expect(error?.causes?.length).toEqual(2)
      expect(error?.causes?.[0].message).toEqual('bar')
      expect(error?.causes?.[0].source).toEqual(ErrorSource.CUSTOM)
      expect(error?.causes?.[1].message).toEqual('biz')
      expect(error?.causes?.[1].source).toEqual(ErrorSource.CUSTOM)
    })

    it('should extract fingerprint from error', () => {
      setupErrorCollection()

      interface DatadogError extends Error {
        dd_fingerprint?: string
      }
      const error = new Error('foo')
      ;(error as DatadogError).dd_fingerprint = 'my-fingerprint'

      addError({
        error,
        handlingStack: 'Error: handling foo',
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      })

      expect((rawRumEvents[0].rawRumEvent as RawRumErrorEvent).error.fingerprint).toEqual('my-fingerprint')
    })

    it('should sanitize error fingerprint', () => {
      setupErrorCollection()

      const error = new Error('foo')
      ;(error as any).dd_fingerprint = 2

      addError({
        error,
        handlingStack: 'Error: handling foo',
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      })

      expect((rawRumEvents[0].rawRumEvent as RawRumErrorEvent).error.fingerprint).toEqual('2')
    })

    it('should save the specified customer context', () => {
      setupErrorCollection()
      addError({
        context: { foo: 'bar' },
        error: new Error('foo'),
        handlingStack: 'Error: handling foo',
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      })
      expect(rawRumEvents[0].customerContext).toEqual({
        foo: 'bar',
      })
    })

    it('should save the global context', () => {
      setupErrorCollection()
      addError(
        {
          error: new Error('foo'),
          handlingStack: 'Error: handling foo',
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        },
        { context: { foo: 'bar' }, user: {}, account: {}, hasReplay: undefined }
      )
      expect(rawRumEvents[0].savedCommonContext!.context).toEqual({
        foo: 'bar',
      })
    })

    it('should save the user', () => {
      setupErrorCollection()
      addError(
        {
          error: new Error('foo'),
          handlingStack: 'Error: handling foo',
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        },
        { context: {}, user: { id: 'foo' }, account: {}, hasReplay: undefined }
      )
      expect(rawRumEvents[0].savedCommonContext!.user).toEqual({
        id: 'foo',
      })
    })

    it('should include non-Error values in domain context', () => {
      setupErrorCollection()
      addError({
        error: { foo: 'bar' },
        handlingStack: 'Error: handling foo',
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      })
      expect(rawRumEvents[0].domainContext).toEqual({
        error: { foo: 'bar' },
        handlingStack: 'Error: handling foo',
      })
    })

    it('should include handling stack', () => {
      setupErrorCollection()

      addError({
        error: new Error('foo'),
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        handlingStack: 'Error\n    at foo\n    at bar',
      })
      expect(rawRumEvents[0].domainContext).toEqual({
        error: new Error('foo'),
        handlingStack: 'Error\n    at foo\n    at bar',
      })
    })
  })

  describe('RAW_ERROR_COLLECTED LifeCycle event', () => {
    it('should create error event from collected error', () => {
      setupErrorCollection()
      const error = new Error('hello')
      lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
        error: {
          message: 'hello',
          source: ErrorSource.CUSTOM,
          stack: 'bar',
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
          type: 'foo',
          originalError: error,
          handlingStack: 'Error: handling foo',
          componentStack: 'at div',
        },
      })

      expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        error: {
          id: jasmine.any(String),
          message: 'hello',
          source: ErrorSource.CUSTOM,
          stack: 'bar',
          handling_stack: 'Error: handling foo',
          component_stack: 'at div',
          type: 'foo',
          handling: undefined,
          source_type: 'browser',
          causes: undefined,
          fingerprint: undefined,
          csp: undefined,
        },
        type: RumEventType.ERROR,
      })
      expect(rawRumEvents[0].domainContext).toEqual({
        error,
        handlingStack: 'Error: handling foo',
      })
    })

    it('should extract disposition from Security Policy Violation Events', () => {
      setupErrorCollection()

      lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
        error: {
          message: 'hello',
          source: ErrorSource.CUSTOM,
          stack: 'bar',
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
          type: 'foo',
          originalError: FAKE_CSP_VIOLATION_EVENT,
          handling: ErrorHandling.HANDLED,
          csp: {
            disposition: FAKE_CSP_VIOLATION_EVENT.disposition,
          },
        },
      })

      expect((rawRumEvents[0].rawRumEvent as RawRumErrorEvent).error.csp?.disposition).toEqual('enforce')
    })

    it('should merge dd_context from the original error with addError context', () => {
      setupErrorCollection()
      const error = new Error('foo')
      ;(error as any).dd_context = { component: 'Menu', param: 123 }

      addError({
        error,
        context: { user: 'john' },
        handlingStack: 'Error: handling dd_context',
        startClocks: { relative: 500 as RelativeTime, timeStamp: 500000 as TimeStamp },
      })
      expect(rawRumEvents[0].customerContext).toEqual({
        component: 'Menu',
        param: 123,
        user: 'john',
      })
    })
  })
})
