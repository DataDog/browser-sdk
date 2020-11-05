import { RequestType, ResourceType } from '@datadog/browser-core'
import { createResourceEntry } from '../../../../test/fixtures'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventCategory, RumResourceEvent } from '../../../types'
import { RumEventType, RumResourceEventV2 } from '../../../typesV2'
import { LifeCycleEventType } from '../../lifeCycle'
import { RequestCompleteEvent } from '../../requestCollection'
import { RumSession } from '../../rumSession'
import { TraceIdentifier } from '../../tracing/tracer'
import { startResourceCollection } from './resourceCollection'

describe('resourceCollection', () => {
  let setupBuilder: TestSetupBuilder

  describe('when resource tracking is enabled', () => {
    beforeEach(() => {
      setupBuilder = setup()
        .withSession({
          getId: () => '1234',
          isTracked: () => true,
          isTrackedWithResource: () => true,
        })
        .withConfiguration({
          isEnabled: () => false,
        })
        .beforeBuild(({ lifeCycle, configuration, session }) => {
          startResourceCollection(lifeCycle, configuration, session)
        })
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should create resource from performance entry', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
        createResourceEntry({
          duration: 100,
          name: 'https://resource.com/valid',
          startTime: 1234,
        })
      )

      expect(rawRumEvents[0].startTime).toBe(1234)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: (jasmine.any(Number) as unknown) as number,
        duration: 100 * 1e6,
        evt: {
          category: RumEventCategory.RESOURCE,
        },
        http: {
          performance: undefined,
          url: 'https://resource.com/valid',
        },
        network: {
          bytesWritten: undefined,
        },
        resource: {
          kind: ResourceType.OTHER,
        },
      })
    })

    it('should create resource from completed request', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          duration: 100,
          method: 'GET',
          startTime: 1234,
          status: 200,
          type: RequestType.XHR,
          url: 'https://resource.com/valid',
        })
      )

      expect(rawRumEvents[0].startTime).toBe(1234)
      expect(rawRumEvents[0].rawRumEvent).toEqual({
        date: (jasmine.any(Number) as unknown) as number,
        duration: 100 * 1e6,
        evt: {
          category: RumEventCategory.RESOURCE,
        },
        http: {
          method: 'GET',
          statusCode: 200,
          url: 'https://resource.com/valid',
        },
        resource: {
          kind: ResourceType.XHR,
        },
      })
    })
  })

  describe('when resource tracking is disabled', () => {
    beforeEach(() => {
      setupBuilder = setup()
        .withSession({
          getId: () => '1234',
          isTracked: () => true,
          isTrackedWithResource: () => false,
        })
        .withConfiguration({
          isEnabled: () => false,
        })
        .beforeBuild(({ lifeCycle, configuration, session }) => {
          startResourceCollection(lifeCycle, configuration, session)
        })
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should not create resource from performance entry', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, createResourceEntry())

      expect(rawRumEvents.length).toBe(0)
    })

    it('should not create resource from completed request', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest())

      expect(rawRumEvents.length).toBe(0)
    })
  })

  describe('when resource tracking change', () => {
    let isTrackedWithResource = true

    beforeEach(() => {
      setupBuilder = setup()
        .withSession({
          getId: () => '1234',
          isTracked: () => true,
          isTrackedWithResource: () => isTrackedWithResource,
        })
        .withConfiguration({
          isEnabled: () => false,
        })
        .beforeBuild(({ lifeCycle, configuration, session }) => {
          startResourceCollection(lifeCycle, configuration, session)
        })
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should enable/disable resource creation from performance entry', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, createResourceEntry())
      expect(rawRumEvents.length).toBe(1)

      isTrackedWithResource = false
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, createResourceEntry())
      expect(rawRumEvents.length).toBe(1)

      isTrackedWithResource = true
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, createResourceEntry())
      expect(rawRumEvents.length).toBe(2)
    })

    it('should enable/disable resource creation from completed request', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest())
      expect(rawRumEvents.length).toBe(1)

      isTrackedWithResource = false
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest())
      expect(rawRumEvents.length).toBe(1)

      isTrackedWithResource = true
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest())
      expect(rawRumEvents.length).toBe(2)
    })
  })

  describe('tracing info', () => {
    beforeEach(() => {
      setupBuilder = setup()
        .withConfiguration({
          isEnabled: () => false,
        })
        .beforeBuild(({ lifeCycle, configuration, session }) => {
          startResourceCollection(lifeCycle, configuration, session)
        })
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should be processed from traced initial document', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
        createResourceEntry({
          traceId: 'xxx',
        })
      )

      const traceInfo = (rawRumEvents[0].rawRumEvent as RumResourceEvent)._dd!
      expect(traceInfo).toBeDefined()
      expect(traceInfo.traceId).toBe('xxx')
    })

    it('should be processed from completed request', () => {
      const { lifeCycle, rawRumEvents } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )

      const traceInfo = (rawRumEvents[0].rawRumEvent as RumResourceEvent)._dd!
      expect(traceInfo).toBeDefined()
      expect(traceInfo.traceId).toBeDefined()
      expect(traceInfo.spanId).toBeDefined()
    })
  })
})

describe('resourceCollection V2', () => {
  let setupBuilder: TestSetupBuilder

  describe('when resource tracking is enabled', () => {
    beforeEach(() => {
      setupBuilder = setup()
        .withSession({
          getId: () => '1234',
          isTracked: () => true,
          isTrackedWithResource: () => true,
        })
        .withConfiguration({
          isEnabled: () => true,
        })
        .beforeBuild(({ lifeCycle, configuration, session }) => {
          startResourceCollection(lifeCycle, configuration, session)
        })
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should create resource from performance entry', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
        createResourceEntry({
          duration: 100,
          name: 'https://resource.com/valid',
          startTime: 1234,
        })
      )

      expect(rawRumEventsV2[0].startTime).toBe(1234)
      expect(rawRumEventsV2[0].rawRumEvent).toEqual({
        date: (jasmine.any(Number) as unknown) as number,
        resource: {
          duration: 100 * 1e6,
          size: undefined,
          type: ResourceType.OTHER,
          url: 'https://resource.com/valid',
        },
        type: RumEventType.RESOURCE,
      })
    })

    it('should create resource from completed request', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          duration: 100,
          method: 'GET',
          startTime: 1234,
          status: 200,
          type: RequestType.XHR,
          url: 'https://resource.com/valid',
        })
      )

      expect(rawRumEventsV2[0].startTime).toBe(1234)
      expect(rawRumEventsV2[0].rawRumEvent).toEqual({
        date: (jasmine.any(Number) as unknown) as number,
        resource: {
          duration: 100 * 1e6,
          method: 'GET',
          statusCode: 200,
          type: ResourceType.XHR,
          url: 'https://resource.com/valid',
        },
        type: RumEventType.RESOURCE,
      })
    })
  })

  describe('when resource tracking is disabled', () => {
    beforeEach(() => {
      setupBuilder = setup()
        .withSession({
          getId: () => '1234',
          isTracked: () => true,
          isTrackedWithResource: () => false,
        })
        .withConfiguration({
          isEnabled: () => true,
        })
        .beforeBuild(({ lifeCycle, configuration, session }) => {
          startResourceCollection(lifeCycle, configuration, session)
        })
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should not create resource from performance entry', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, createResourceEntry())

      expect(rawRumEventsV2.length).toBe(0)
    })

    it('should not create resource from completed request', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest())

      expect(rawRumEventsV2.length).toBe(0)
    })
  })

  describe('when resource tracking change', () => {
    let isTrackedWithResource = true

    beforeEach(() => {
      setupBuilder = setup()
        .withSession({
          getId: () => '1234',
          isTracked: () => true,
          isTrackedWithResource: () => isTrackedWithResource,
        })
        .withConfiguration({
          isEnabled: () => true,
        })
        .beforeBuild(({ lifeCycle, configuration, session }) => {
          startResourceCollection(lifeCycle, configuration, session)
        })
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should enable/disable resource creation from performance entry', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, createResourceEntry())
      expect(rawRumEventsV2.length).toBe(1)

      isTrackedWithResource = false
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, createResourceEntry())
      expect(rawRumEventsV2.length).toBe(1)

      isTrackedWithResource = true
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, createResourceEntry())
      expect(rawRumEventsV2.length).toBe(2)
    })

    it('should enable/disable resource creation from completed request', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest())
      expect(rawRumEventsV2.length).toBe(1)

      isTrackedWithResource = false
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest())
      expect(rawRumEventsV2.length).toBe(1)

      isTrackedWithResource = true
      lifeCycle.notify(LifeCycleEventType.REQUEST_COMPLETED, createCompletedRequest())
      expect(rawRumEventsV2.length).toBe(2)
    })
  })

  describe('tracing info', () => {
    beforeEach(() => {
      setupBuilder = setup()
        .withConfiguration({
          isEnabled: () => true,
        })
        .beforeBuild(({ lifeCycle, configuration, session }) => {
          startResourceCollection(lifeCycle, configuration, session)
        })
    })

    afterEach(() => {
      setupBuilder.cleanup()
    })

    it('should be processed from traced initial document', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
        createResourceEntry({
          traceId: '1234',
        })
      )

      const traceInfo = (rawRumEventsV2[0].rawRumEvent as RumResourceEventV2)._dd!
      expect(traceInfo).toBeDefined()
      expect(traceInfo.traceId).toBe('1234')
    })

    it('should be processed from completed request', () => {
      const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
      lifeCycle.notify(
        LifeCycleEventType.REQUEST_COMPLETED,
        createCompletedRequest({
          spanId: new TraceIdentifier(),
          traceId: new TraceIdentifier(),
        })
      )

      const traceInfo = (rawRumEventsV2[0].rawRumEvent as RumResourceEventV2)._dd!
      expect(traceInfo).toBeDefined()
      expect(traceInfo.traceId).toBeDefined()
      expect(traceInfo.spanId).toBeDefined()
    })
  })
})

function createCompletedRequest(details?: Partial<RequestCompleteEvent>): RequestCompleteEvent {
  const request: Partial<RequestCompleteEvent> = {
    duration: 100,
    method: 'GET',
    startTime: 1234,
    status: 200,
    type: RequestType.XHR,
    url: 'https://resource.com/valid',
    ...details,
  }
  return request as RequestCompleteEvent
}
