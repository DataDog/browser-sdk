import type { RelativeTime, TimeStamp, ErrorWithCause } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource, NO_ERROR_STACK_PRESENT_MESSAGE } from '@datadog/browser-core'
import { FAKE_CSP_VIOLATION_EVENT } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import type { RawRumErrorEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import { doStartErrorCollection } from './errorCollection'

describe('error collection', () => {
  let setupBuilder: TestSetupBuilder
  let addError: ReturnType<typeof doStartErrorCollection>['addError']
  const viewContextsStub = {
    findView: jasmine.createSpy('findView').and.returnValue({
      id: 'abcde',
      name: 'foo',
    }),
  }

  beforeEach(() => {
    setupBuilder = setup()
      .withViewContexts(viewContextsStub)
      .withPageStateHistory({
        wasInPageStateAt: () => true,
      })
      .beforeBuild(({ lifeCycle, pageStateHistory, featureFlagContexts }) => {
        ;({ addError } = doStartErrorCollection(lifeCycle, pageStateHistory, featureFlagContexts))
      })
  })

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
        const { rawRumEvents } = setupBuilder.build()

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
              type,
              handling: ErrorHandling.HANDLED,
              source_type: 'browser',
              causes: undefined,
              fingerprint: undefined,
              csp: undefined,
            },
            type: RumEventType.ERROR,
            view: {
              in_foreground: true,
            },
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
      const { rawRumEvents } = setupBuilder.build()
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
      const { rawRumEvents } = setupBuilder.build()

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
      const { rawRumEvents } = setupBuilder.build()

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
      const { rawRumEvents } = setupBuilder.build()
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
      const { rawRumEvents } = setupBuilder.build()
      addError(
        {
          error: new Error('foo'),
          handlingStack: 'Error: handling foo',
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        },
        { context: { foo: 'bar' }, user: {}, hasReplay: undefined }
      )
      expect(rawRumEvents[0].savedCommonContext!.context).toEqual({
        foo: 'bar',
      })
    })

    it('should save the user', () => {
      const { rawRumEvents } = setupBuilder.build()
      addError(
        {
          error: new Error('foo'),
          handlingStack: 'Error: handling foo',
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        },
        { context: {}, user: { id: 'foo' }, hasReplay: undefined }
      )
      expect(rawRumEvents[0].savedCommonContext!.user).toEqual({
        id: 'foo',
      })
    })

    it('should include non-Error values in domain context', () => {
      const { rawRumEvents } = setupBuilder.build()
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

    it('should include feature flags', () => {
      const { rawRumEvents } = setupBuilder
        .withFeatureFlagContexts({ findFeatureFlagEvaluations: () => ({ feature: 'foo' }) })
        .build()

      addError({
        error: { foo: 'bar' },
        handlingStack: 'Error: handling foo',
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      })

      const rawRumErrorEvent = rawRumEvents[0].rawRumEvent as RawRumErrorEvent

      expect(rawRumErrorEvent.feature_flags).toEqual({ feature: 'foo' })
    })

    it('should include handling stack', () => {
      const { rawRumEvents } = setupBuilder.build()

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
      const { rawRumEvents, lifeCycle } = setupBuilder.build()
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
          type: 'foo',
          handling: undefined,
          source_type: 'browser',
          causes: undefined,
          fingerprint: undefined,
          csp: undefined,
        },
        view: {
          in_foreground: true,
        },
        type: RumEventType.ERROR,
      })
      expect(rawRumEvents[0].domainContext).toEqual({
        error,
        handlingStack: 'Error: handling foo',
      })
    })

    it('should extract disposition from Security Policy Violation Events', () => {
      const { rawRumEvents, lifeCycle } = setupBuilder.build()

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
  })
})
