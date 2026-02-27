import type { Duration, ServerDuration } from '@datadog/browser-core'
import { ResourceType } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { collectAndValidateRawRumEvents } from '../../../test'
import type { RawRumResourceEvent, RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import { type RawRumEventCollectedData, LifeCycle } from '../lifeCycle'
import { startEventTracker } from '../eventTracker'
import type { ManualResourceData } from './trackManualResources'
import { trackManualResources } from './trackManualResources'

describe('trackManualResources', () => {
  let lifeCycle: LifeCycle
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>>
  let startResource: ReturnType<typeof trackManualResources>['startResource']
  let stopResource: ReturnType<typeof trackManualResources>['stopResource']
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    lifeCycle = new LifeCycle()

    const resourceTracker = startEventTracker<ManualResourceData>(lifeCycle)
    const manualResources = trackManualResources(lifeCycle, resourceTracker)
    startResource = manualResources.startResource
    stopResource = manualResources.stopResource

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

    it('should override start type with stop type', () => {
      startResource('https://api.example.com/data', { type: ResourceType.XHR })
      stopResource('https://api.example.com/data', { type: ResourceType.FETCH })

      expect(rawRumEvents).toHaveSize(1)
      const resourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(resourceEvent.resource.type).toBe(ResourceType.FETCH)
    })

    it('should preserve start type when stop does not provide a type', () => {
      startResource('https://api.example.com/data', { type: ResourceType.IMAGE })
      stopResource('https://api.example.com/data')

      expect(rawRumEvents).toHaveSize(1)
      const resourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(resourceEvent.resource.type).toBe(ResourceType.IMAGE)
    })
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

  describe('context merging', () => {
    it('should merge contexts from start and stop', () => {
      startResource('https://api.example.com/data', { context: { startKey: 'value1' } })
      stopResource('https://api.example.com/data', { context: { stopKey: 'value2' } })

      expect(rawRumEvents).toHaveSize(1)
      const resourceEvent = rawRumEvents[0].rawRumEvent as RawRumResourceEvent
      expect(resourceEvent.context).toEqual({
        startKey: 'value1',
        stopKey: 'value2',
      })
    })
  })

  describe('invalid URL handling', () => {
    it('should handle stopping with undefined URL but valid resourceKey', () => {
      startResource('https://api.example.com/data', { resourceKey: 'key1' })
      stopResource(undefined as any, { resourceKey: 'key1' })

      expect(rawRumEvents).toHaveSize(1)
      expect((rawRumEvents[0].rawRumEvent as RawRumResourceEvent).resource.url).toBe('https://api.example.com/data')
    })
  })
})
