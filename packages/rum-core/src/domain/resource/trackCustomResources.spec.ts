import { elapsed, ResourceType } from '@datadog/browser-core'
import type { Duration } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { CustomResource } from './trackCustomResources'
import { trackCustomResources } from './trackCustomResources'

describe('trackCustomResources', () => {
  const lifeCycle = new LifeCycle()
  let completedResources: CustomResource[]
  let errorResources: Array<{ url: string; errorMessage: string }>
  let startResource: ReturnType<typeof trackCustomResources>['startResource']
  let stopResource: ReturnType<typeof trackCustomResources>['stopResource']
  let stopResourceWithError: ReturnType<typeof trackCustomResources>['stopResourceWithError']
  let stopTracking: ReturnType<typeof trackCustomResources>['stop']
  let clock: Clock

  function getDuration(resource: CustomResource): Duration {
    return elapsed(resource.startClocks.relative, resource.stopClocks.relative)
  }

  beforeEach(() => {
    clock = mockClock()
    completedResources = []
    errorResources = []

    const tracking = trackCustomResources(
      lifeCycle,
      (resource) => {
        completedResources.push(resource)
      },
      (url, errorMessage) => {
        errorResources.push({ url, errorMessage })
      }
    )

    registerCleanupTask(tracking.stop)
    startResource = tracking.startResource
    stopResource = tracking.stopResource
    stopResourceWithError = tracking.stopResourceWithError
    stopTracking = tracking.stop
  })

  describe('basic functionality', () => {
    it('should create resource with duration from url-based tracking', () => {
      startResource('https://example.com/api/data')
      clock.tick(500)
      stopResource('https://example.com/api/data')

      expect(completedResources).toHaveSize(1)
      expect(getDuration(completedResources[0])).toBe(500 as Duration)
      expect(completedResources[0].url).toBe('https://example.com/api/data')
    })

    it('should not create resource if stopped without starting', () => {
      stopResource('https://never.started.com')

      expect(completedResources).toHaveSize(0)
    })

    it('should only create resource once when stopped multiple times', () => {
      startResource('https://example.com/api')
      stopResource('https://example.com/api')
      stopResource('https://example.com/api')

      expect(completedResources).toHaveSize(1)
    })
  })

  describe('resource types', () => {
    ;[ResourceType.FETCH, ResourceType.XHR, ResourceType.IMAGE, ResourceType.JS, ResourceType.CSS].forEach(
      (resourceType) => {
        it(`should support ${resourceType} resource type`, () => {
          startResource('https://example.com/resource', { type: resourceType })
          stopResource('https://example.com/resource')

          expect(completedResources).toHaveSize(1)
          expect(completedResources[0].type).toBe(resourceType)
        })
      }
    )

    it('should default to undefined when no type specified (type is applied in resourceCollection)', () => {
      startResource('https://example.com/resource')
      stopResource('https://example.com/resource')

      expect(completedResources).toHaveSize(1)
      expect(completedResources[0].type).toBeUndefined()
    })
  })

  describe('resource options', () => {
    it('should include method when provided', () => {
      startResource('https://example.com/api', { method: 'POST' })
      stopResource('https://example.com/api')

      expect(completedResources).toHaveSize(1)
      expect(completedResources[0].method).toBe('POST')
    })

    it('should include status code when provided on stop', () => {
      startResource('https://example.com/api')
      stopResource('https://example.com/api', { statusCode: 200 })

      expect(completedResources).toHaveSize(1)
      expect(completedResources[0].statusCode).toBe(200)
    })

    it('should include size when provided on stop', () => {
      startResource('https://example.com/api')
      stopResource('https://example.com/api', { size: 1024 })

      expect(completedResources).toHaveSize(1)
      expect(completedResources[0].size).toBe(1024)
    })
  })

  describe('context merging', () => {
    it('should merge contexts with stop precedence on conflicts', () => {
      startResource('https://example.com/api', { context: { request: 'abc' } })
      stopResource('https://example.com/api', { context: { response: 'xyz' } })

      expect(completedResources).toHaveSize(1)
      expect(completedResources[0].context).toEqual({ request: 'abc', response: 'xyz' })
    })

    it('should override conflicting context values on stop', () => {
      startResource('https://example.com/api', { context: { status: 'pending' } })
      stopResource('https://example.com/api', { context: { status: 'complete' } })

      expect(completedResources).toHaveSize(1)
      expect(completedResources[0].context).toEqual({ status: 'complete' })
    })
  })

  describe('resourceKey', () => {
    it('should support resourceKey for tracking multiple resources with same URL', () => {
      startResource('https://example.com/api', { resourceKey: 'request1' })
      startResource('https://example.com/api', { resourceKey: 'request2' })

      clock.tick(100)
      stopResource('https://example.com/api', { resourceKey: 'request2' })

      clock.tick(100)
      stopResource('https://example.com/api', { resourceKey: 'request1' })

      expect(completedResources).toHaveSize(2)
      expect(getDuration(completedResources[0])).toBe(100 as Duration)
      expect(getDuration(completedResources[1])).toBe(200 as Duration)
    })

    it('should use URL as key when resourceKey not provided', () => {
      startResource('https://example.com/api1')
      startResource('https://example.com/api2')

      clock.tick(100)
      stopResource('https://example.com/api1')
      stopResource('https://example.com/api2')

      expect(completedResources).toHaveSize(2)
    })

    it('resourceKey should not collide with URL', () => {
      startResource('https://example.com/api key')
      startResource('https://example.com/api', { resourceKey: 'key' })

      stopResource('https://example.com/api key')
      stopResource('https://example.com/api', { resourceKey: 'key' })

      expect(completedResources).toHaveSize(2)
      expect(completedResources[0].url).toBe('https://example.com/api key')
      expect(completedResources[1].url).toBe('https://example.com/api')
    })
  })

  describe('duplicate start handling', () => {
    it('should discard previous resource when startResource is called twice with same key', () => {
      startResource('https://example.com/api')
      clock.tick(100)

      startResource('https://example.com/api')
      clock.tick(200)
      stopResource('https://example.com/api')

      expect(completedResources).toHaveSize(1)
      expect(getDuration(completedResources[0])).toBe(200 as Duration)
    })
  })

  describe('stopResourceWithError', () => {
    it('should emit error instead of resource when stopped with error', () => {
      startResource('https://example.com/api')
      clock.tick(500)
      stopResourceWithError('https://example.com/api', 'Connection timeout')

      expect(completedResources).toHaveSize(0)
      expect(errorResources).toHaveSize(1)
      expect(errorResources[0].url).toBe('https://example.com/api')
      expect(errorResources[0].errorMessage).toBe('Connection timeout')
    })

    it('should not emit error if resource was not started', () => {
      stopResourceWithError('https://never.started.com', 'Error message')

      expect(errorResources).toHaveSize(0)
    })

    it('should support resourceKey for error tracking', () => {
      startResource('https://example.com/api', { resourceKey: 'req1' })
      startResource('https://example.com/api', { resourceKey: 'req2' })

      stopResourceWithError('https://example.com/api', 'Error 1', { resourceKey: 'req1' })
      stopResource('https://example.com/api', { resourceKey: 'req2' })

      expect(errorResources).toHaveSize(1)
      expect(completedResources).toHaveSize(1)
    })
  })

  describe('session renewal', () => {
    it('should discard active resources on session renewal', () => {
      startResource('https://example.com/api')

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      stopResource('https://example.com/api')

      expect(completedResources).toHaveSize(0)
    })
  })

  describe('cleanup', () => {
    it('should clean up active resources on stop()', () => {
      startResource('https://example.com/api1')
      startResource('https://example.com/api2')

      stopTracking()

      stopResource('https://example.com/api1')
      stopResource('https://example.com/api2')

      expect(completedResources).toHaveSize(0)
    })
  })
})
