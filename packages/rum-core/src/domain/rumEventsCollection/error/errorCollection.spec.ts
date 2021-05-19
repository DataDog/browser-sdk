import { ErrorSource, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { doStartErrorCollection } from './errorCollection'

describe('error collection', () => {
  let setupBuilder: TestSetupBuilder
  let addError: ReturnType<typeof doStartErrorCollection>['addError']

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .beforeBuild(({ lifeCycle }) => {
        ;({ addError } = doStartErrorCollection(lifeCycle))
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('provided', () => {
    it('notifies a raw rum error event', () => {
      const { rawRumEvents } = setupBuilder.build()
      addError({
        error: new Error('foo'),
        source: ErrorSource.CUSTOM,
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
            resource: undefined,
            source: ErrorSource.CUSTOM,
            stack: jasmine.stringMatching('Error: foo'),
            type: 'Error',
          },
          type: RumEventType.ERROR,
        },
        savedCommonContext: undefined,
        startTime: 1234,
      })
    })

    it('should save the specified customer context', () => {
      const { rawRumEvents } = setupBuilder.build()
      addError({
        context: { foo: 'bar' },
        error: new Error('foo'),
        source: ErrorSource.CUSTOM,
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
          source: ErrorSource.CUSTOM,
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
          source: ErrorSource.CUSTOM,
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        },
        { context: {}, user: { id: 'foo' } }
      )
      expect(rawRumEvents[0].savedCommonContext!.user).toEqual({
        id: 'foo',
      })
    })
  })

  describe('RAW_ERROR_COLLECTED LifeCycle event', () => {
    it('should create error event from collected error', () => {
      const { rawRumEvents, lifeCycle } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, {
        error: {
          message: 'hello',
          resource: {
            method: 'GET',
            statusCode: 500,
            url: 'url',
          },
          source: ErrorSource.NETWORK,
          stack: 'bar',
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
          type: 'foo',
        },
      })

      expect(rawRumEvents[0].startTime).toBe(1234)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        error: {
          id: jasmine.any(String),
          message: 'hello',
          resource: {
            method: 'GET',
            status_code: 500,
            url: 'url',
          },
          source: ErrorSource.NETWORK,
          stack: 'bar',
          type: 'foo',
        },
        type: RumEventType.ERROR,
      })
    })
  })
})
