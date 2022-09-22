import type { RelativeTime, TimeStamp, ErrorWithCause } from '@datadog/browser-core'
import { ErrorHandling, ErrorSource } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../../test/specHelper'
import { setup } from '../../../../test/specHelper'
import type { RawRumErrorEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { doStartErrorCollection } from './errorCollection'

describe('error collection', () => {
  let setupBuilder: TestSetupBuilder
  let addError: ReturnType<typeof doStartErrorCollection>['addError']

  beforeEach(() => {
    setupBuilder = setup()
      .withForegroundContexts({
        isInForegroundAt: () => true,
      })
      .beforeBuild(({ lifeCycle, foregroundContexts }) => {
        ;({ addError } = doStartErrorCollection(lifeCycle, foregroundContexts))
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('provided', () => {
    it('notifies a raw rum error event', () => {
      const { rawRumEvents } = setupBuilder.build()
      const error = new Error('foo')

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
            message: 'foo',
            source: ErrorSource.CUSTOM,
            stack: jasmine.stringMatching('Error: foo'),
            handling_stack: 'Error: handling foo',
            type: 'Error',
            handling: ErrorHandling.HANDLED,
            source_type: 'browser',
            causes: undefined,
          },
          type: RumEventType.ERROR,
          view: {
            in_foreground: true,
          },
        },
        savedCommonContext: undefined,
        startTime: 1234 as RelativeTime,
        domainContext: { error },
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
        { context: { foo: 'bar' }, user: {} }
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
        { context: {}, user: { id: 'foo' } }
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
          handling_stack: undefined,
          type: 'foo',
          handling: undefined,
          source_type: 'browser',
          causes: undefined,
        },
        view: {
          in_foreground: true,
        },
        type: RumEventType.ERROR,
      })
      expect(rawRumEvents[0].domainContext).toEqual({
        error,
      })
    })
  })
})
