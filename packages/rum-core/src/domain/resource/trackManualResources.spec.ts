import type { Duration, ServerDuration } from '@datadog/browser-core'
import { ResourceType } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { collectAndValidateRawRumEvents } from '../../../test'
import type { RawRumResourceEvent, RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { type RawRumEventCollectedData, LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { trackManualResources } from './trackManualResources'

describe('trackManualResources', () => {
  let lifeCycle: LifeCycle
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>>
  let startResource: ReturnType<typeof trackManualResources>['startResource']
  let stopResource: ReturnType<typeof trackManualResources>['stopResource']
  let stopManualResources: ReturnType<typeof trackManualResources>['stop']
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    lifeCycle = new LifeCycle()

    const manualResources = trackManualResources(lifeCycle)
    registerCleanupTask(manualResources.stop)
    startResource = manualResources.startResource
    stopResource = manualResources.stopResource
    stopManualResources = manualResources.stop

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  })

  describe('basic functionality', () => {
    it('should create resource with duration from url-based tracking', () => {
      startResource('https://api.example.com/data')
      clock.tick(500)
      stopResource('https://api.example.com/data')

      expect(rawRumEvents).toHaveSize(1)
      expect(rawRumEvents[0].duration).toBe(500 as Duration)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          type: RumEventType.RESOURCE,
          resource: jasmine.objectContaining({
            url: 'https://api.example.com/data',
            type: ResourceType.OTHER,
          }),
        })
      )
    })

    it('should not create resource if stopped without starting', () => {
      stopResource('https://api.example.com/never-started')

      expect(rawRumEvents).toHaveSize(0)
    })

    it('should only create resource once when stopped multiple times', () => {
      startResource('https://api.example.com/data')
      stopResource('https://api.example.com/data')
      stopResource('https://api.example.com/data')

      expect(rawRumEvents).toHaveSize(1)
    })

    it('should include duration in server format', () => {
      startResource('https://api.example.com/data')
      clock.tick(500)
      stopResource('https://api.example.com/data')

      expect(rawRumEvents).toHaveSize(1)
      const resourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(resourceEvent.resource.duration).toBe((500 * 1e6) as ServerDuration)
    })
  })

  describe('resource types', () => {
    it('should default to "other" type when not specified', () => {
      startResource('https://api.example.com/data')
      stopResource('https://api.example.com/data')

      expect(rawRumEvents).toHaveSize(1)
      const resourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(resourceEvent.resource.type).toBe(ResourceType.OTHER)
    })
    ;[ResourceType.XHR, ResourceType.FETCH, ResourceType.IMAGE, ResourceType.JS, ResourceType.CSS].forEach(
      (resourceType) => {
        it(`should support ${resourceType} resource type`, () => {
          startResource('https://api.example.com/data', { type: resourceType })
          stopResource('https://api.example.com/data')

          expect(rawRumEvents).toHaveSize(1)
          const resourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
          expect(resourceEvent.resource.type).toBe(resourceType)
        })
      }
    )
  })

  describe('method and status_code', () => {
    it('should include method and status_code when provided', () => {
      startResource('https://api.example.com/data', { method: 'POST' })
      stopResource('https://api.example.com/data', { statusCode: 200 })

      expect(rawRumEvents).toHaveSize(1)
      const resourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(resourceEvent.resource.method).toBe('POST')
      expect(resourceEvent.resource.status_code).toBe(200)
    })
  })

  describe('context merging', () => {
    it('should merge contexts with stop precedence on conflicts', () => {
      startResource('https://api.example.com/data', { context: { requestId: 'abc' } })
      stopResource('https://api.example.com/data', { context: { responseSize: 1024 } })

      expect(rawRumEvents).toHaveSize(1)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          context: { requestId: 'abc', responseSize: 1024 },
        })
      )
    })

    it('should override start context with stop context on conflict', () => {
      startResource('https://api.example.com/data', { context: { status: 'pending' } })
      stopResource('https://api.example.com/data', { context: { status: 'complete' } })

      expect(rawRumEvents).toHaveSize(1)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          context: { status: 'complete' },
        })
      )
    })
  })

  describe('resourceKey', () => {
    it('should support resourceKey for tracking same url multiple times', () => {
      startResource('https://api.example.com/data', { resourceKey: 'request1' })
      startResource('https://api.example.com/data', { resourceKey: 'request2' })

      clock.tick(100)
      stopResource('https://api.example.com/data', { resourceKey: 'request2' })

      clock.tick(100)
      stopResource('https://api.example.com/data', { resourceKey: 'request1' })

      expect(rawRumEvents).toHaveSize(2)
      expect(rawRumEvents[0].duration).toBe(100 as Duration)
      expect(rawRumEvents[1].duration).toBe(200 as Duration)
    })

    it('should not collide between url and resourceKey', () => {
      startResource('https://api.example.com/foo/bar')
      startResource('https://api.example.com/foo', { resourceKey: 'bar' })

      stopResource('https://api.example.com/foo/bar')
      stopResource('https://api.example.com/foo', { resourceKey: 'bar' })

      expect(rawRumEvents).toHaveSize(2)
      expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent).resource.url).toBe('https://api.example.com/foo/bar')
      expect((rawRumEvents[1].rawRumEvent as RawRumResourceEvent).resource.url).toBe('https://api.example.com/foo')
    })
  })

  describe('duplicate start handling', () => {
    it('should discard previous resource when startResource is called twice with same key', () => {
      startResource('https://api.example.com/data')
      clock.tick(100)
      startResource('https://api.example.com/data')
      clock.tick(200)
      stopResource('https://api.example.com/data')

      expect(rawRumEvents).toHaveSize(1)
      expect(rawRumEvents[0].duration).toBe(200 as Duration)
    })
  })

  describe('session renewal', () => {
    it('should discard active manual resources on session renewal', () => {
      startResource('https://api.example.com/data')

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      stopResource('https://api.example.com/data')

      expect(rawRumEvents).toHaveSize(0)
    })
  })

  describe('cleanup', () => {
    it('should clean up active manual resources on stop()', () => {
      startResource('https://api.example.com/data')

      stopManualResources()

      stopResource('https://api.example.com/data')

      expect(rawRumEvents).toHaveSize(0)
    })
  })
})
