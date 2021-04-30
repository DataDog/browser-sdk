import { ErrorSource, Observable, RawError, RelativeTime, TimeStamp, Configuration } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType } from '../../../rawRumEvent.types'
import { doStartErrorCollection } from './errorCollection'

const configuration: Partial<Configuration> = { isEnabled: () => true }

describe('error collection', () => {
  let setupBuilder: TestSetupBuilder
  const errorObservable = new Observable<RawError>()
  let addError: ReturnType<typeof doStartErrorCollection>['addError']
  let hasFocus = false

  beforeEach(() => {
    hasFocus = false
    spyOn(Document.prototype, 'hasFocus').and.callFake(() => hasFocus)

    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .beforeBuild(({ lifeCycle }) => {
        ;({ addError } = doStartErrorCollection(lifeCycle, errorObservable, configuration as Configuration))
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
          focus: {
            start_focused: false,
          },
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

    describe('when the user focus the document', () => {
      beforeEach(() => {
        hasFocus = true
      })
      it('notifies a raw rum error event with focus', () => {
        const { rawRumEvents } = setupBuilder.build()
        addError({
          error: new Error('foo'),
          source: ErrorSource.CUSTOM,
          startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        })

        expect(rawRumEvents.length).toBe(1)
        expect(rawRumEvents[0].rawRumEvent).toEqual({
          date: jasmine.any(Number),
          focus: {
            start_focused: true,
          },
          error: {
            message: 'foo',
            resource: undefined,
            source: ErrorSource.CUSTOM,
            stack: jasmine.stringMatching('Error: foo'),
            type: 'Error',
          },
          type: RumEventType.ERROR,
        })
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
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        type: 'foo',
      })

      expect(rawRumEvents[0].startTime).toBe(1234)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: jasmine.any(Number),
        focus: { start_focused: false },
        error: {
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
