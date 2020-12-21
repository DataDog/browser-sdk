import { ErrorSource, Observable, RawError } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType } from '../../../rawRumEvent.types'
import { doStartErrorCollection } from './errorCollection'

describe('error collection', () => {
  let setupBuilder: TestSetupBuilder
  const errorObservable = new Observable<RawError>()
  let addError: ReturnType<typeof doStartErrorCollection>['addError']

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .beforeBuild(({ lifeCycle, configuration }) => {
        ;({ addError } = doStartErrorCollection(lifeCycle, configuration, errorObservable))
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
        startTime: 12,
      })

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0]).toEqual({
        customerContext: undefined,
        rawRumEvent: {
          date: jasmine.any(Number),
          error: {
            message: 'foo',
            resource: undefined,
            source: ErrorSource.CUSTOM,
            stack: jasmine.stringMatching('Error: foo'),
            type: 'Error',
          },
          type: RumEventType.ERROR,
        },
        savedCommonContext: undefined,
        startTime: 12,
      })
    })

    it('should save the specified customer context', () => {
      const { rawRumEvents } = setupBuilder.build()
      addError({
        context: { foo: 'bar' },
        error: new Error('foo'),
        source: ErrorSource.CUSTOM,
        startTime: 12,
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
          startTime: 12,
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
          startTime: 12,
        },
        { context: {}, user: { id: 'foo' } }
      )
      expect(rawRumEvents[0].savedCommonContext!.user).toEqual({
        id: 'foo',
      })
    })
  })

  describe('auto', () => {
    it('should create error event from collected error', () => {
      const { rawRumEvents } = setupBuilder.build()
      errorObservable.notify({
        message: 'hello',
        resource: {
          method: 'GET',
          statusCode: 500,
          url: 'url',
        },
        source: ErrorSource.NETWORK,
        stack: 'bar',
        startTime: 1234,
        type: 'foo',
      })

      expect(rawRumEvents[0].startTime).toBe(1234)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        error: {
          message: 'hello',
          resource: {
            method: 'GET',
            statusCode: 500,
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
