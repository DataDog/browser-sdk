import { Observable, RawError } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { ErrorSource, RumEventCategory } from '../../../index'
import { RumEventType } from '../../../typesV2'
import { LifeCycleEventType } from '../../lifeCycle'
import { doStartErrorCollection } from './errorCollection'

describe('error collection', () => {
  let setupBuilder: TestSetupBuilder
  const errorObservable = new Observable<RawError>()

  beforeEach(() => {
    setupBuilder = setup().beforeBuild((lifeCycle, configuration) => {
      configuration.isEnabled = () => false
      doStartErrorCollection(lifeCycle, configuration, errorObservable)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('provided', () => {
    it('notifies a raw rum error event', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.ERROR_PROVIDED, {
        error: {
          error: new Error('foo'),
          source: ErrorSource.CUSTOM,
          startTime: 12,
        },
      })

      expect(rawRumEvents.length).toBe(1)
      expect(rawRumEvents[0]).toEqual({
        customerContext: undefined,
        rawRumEvent: {
          date: jasmine.any(Number),
          error: {
            kind: 'Error',
            origin: ErrorSource.CUSTOM,
            stack: jasmine.stringMatching('Error: foo'),
          },
          evt: {
            category: RumEventCategory.ERROR,
          },
          message: 'foo',
        },
        savedGlobalContext: undefined,
        startTime: 12,
      })
    })

    it('should save the specified customer context', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.ERROR_PROVIDED, {
        error: {
          context: { foo: 'bar' },
          error: new Error('foo'),
          source: ErrorSource.CUSTOM,
          startTime: 12,
        },
      })
      expect(rawRumEvents[0].customerContext).toEqual({
        foo: 'bar',
      })
    })

    it('should save the global context', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.ERROR_PROVIDED, {
        context: { foo: 'bar' },
        error: {
          error: new Error('foo'),
          source: ErrorSource.CUSTOM,
          startTime: 12,
        },
      })
      expect(rawRumEvents[0].savedGlobalContext).toEqual({
        foo: 'bar',
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
          kind: 'foo',
          origin: ErrorSource.NETWORK,
          stack: 'bar',
        },
        evt: {
          category: RumEventCategory.ERROR,
        },
        http: {
          method: 'GET',
          status_code: 500,
          url: 'url',
        },
        message: 'hello',
      })
    })
  })
})

describe('error collection v2', () => {
  let setupBuilder: TestSetupBuilder
  const errorObservable = new Observable<RawError>()

  beforeEach(() => {
    setupBuilder = setup().beforeBuild((lifeCycle, configuration) => {
      configuration.isEnabled = () => true
      doStartErrorCollection(lifeCycle, configuration, errorObservable)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('provided', () => {
    it('notifies a raw rum error event', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.ERROR_PROVIDED, {
        error: {
          error: new Error('foo'),
          source: ErrorSource.CUSTOM,
          startTime: 12,
        },
      })

      expect(rawRumEventsV2.length).toBe(1)
      expect(rawRumEventsV2[0]).toEqual({
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
        savedGlobalContext: undefined,
        startTime: 12,
      })
    })

    it('should save the specified customer context', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.ERROR_PROVIDED, {
        error: {
          context: { foo: 'bar' },
          error: new Error('foo'),
          source: ErrorSource.CUSTOM,
          startTime: 12,
        },
      })
      expect(rawRumEventsV2[0].customerContext).toEqual({
        foo: 'bar',
      })
    })

    it('should save the global context', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.ERROR_PROVIDED, {
        context: { foo: 'bar' },
        error: {
          error: new Error('foo'),
          source: ErrorSource.CUSTOM,
          startTime: 12,
        },
      })
      expect(rawRumEventsV2[0].savedGlobalContext).toEqual({
        foo: 'bar',
      })
    })
  })

  describe('auto', () => {
    it('should create error event from collected error', () => {
      const { rawRumEventsV2 } = setupBuilder.build()
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

      expect(rawRumEventsV2[0].startTime).toBe(1234)
      expect(rawRumEventsV2[0].rawRumEvent).toEqual({
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
