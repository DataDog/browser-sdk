import type { Duration, RelativeTime } from '@datadog/js-core/time'
import { relativeToClocks } from '@datadog/js-core/time'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { ViewHistoryEntry } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { mockViewHistory, setupLocationObserver } from '../../../../../browser-rum-core/test'
import { createProfilerViewHistory, getCustomOrDefaultViewName, getDefaultViewName } from './profilerViewHistory'

describe('profilerViewHistory', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    mockClock()
    lifeCycle = new LifeCycle()
  })

  function setup(initialView?: ViewHistoryEntry) {
    const history = createProfilerViewHistory(lifeCycle, mockViewHistory(initialView))
    registerCleanupTask(() => history.stop())
    return history
  }

  it('should include the view already active when the profiler loads', () => {
    const history = setup({ id: 'initial', name: 'Initial view', startClocks: relativeToClocks(10 as RelativeTime) })

    expect(history.findAll(15 as RelativeTime, 5 as Duration)).toEqual([
      { viewId: 'initial', viewName: 'Initial view', startClocks: relativeToClocks(10 as RelativeTime) },
    ])
  })

  it('should track the first view when there was no view at initialization', () => {
    const history = setup()
    expect(history.findAll(0 as RelativeTime, 10 as Duration)).toEqual([])

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      id: 'first',
      name: 'First view',
      startClocks: relativeToClocks(20 as RelativeTime),
    })

    expect(history.findAll(25 as RelativeTime, 5 as Duration)).toEqual([
      { viewId: 'first', viewName: 'First view', startClocks: relativeToClocks(20 as RelativeTime) },
    ])
  })

  it('should retain default names after the pathname changes', () => {
    const { changeLocation } = setupLocationObserver('http://example.com/user/123')
    const history = setup({ id: 'initial', startClocks: relativeToClocks(10 as RelativeTime) })

    changeLocation('/profile/456')
    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      id: 'next',
      startClocks: relativeToClocks(20 as RelativeTime),
    })
    changeLocation('/other')

    expect(history.findAll(15 as RelativeTime, 10 as Duration)).toEqual([
      { viewId: 'next', viewName: '/profile/?', startClocks: relativeToClocks(20 as RelativeTime) },
      { viewId: 'initial', viewName: '/user/?', startClocks: relativeToClocks(10 as RelativeTime) },
    ])
  })

  it('should return only views overlapping the requested interval', () => {
    const history = setup({ id: 'initial', name: 'Initial', startClocks: relativeToClocks(10 as RelativeTime) })

    lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      id: 'next',
      name: 'Next',
      startClocks: relativeToClocks(20 as RelativeTime),
    })

    expect(history.findAll(15 as RelativeTime, 10 as Duration).map((view) => view.viewId)).toEqual(['next', 'initial'])
    expect(history.findAll(25 as RelativeTime, 10 as Duration).map((view) => view.viewId)).toEqual(['next'])
    expect(history.findAll(0 as RelativeTime, 5 as Duration)).toEqual([])
  })
})

describe('getCustomOrDefaultViewName', () => {
  describe('when customViewName is provided', () => {
    it('should return the custom view name when it is a non-empty string', () => {
      expect(getCustomOrDefaultViewName('Custom View Name', '/user/123')).toBe('Custom View Name')
    })

    it('should return the default view name when it is an empty string', () => {
      expect(getCustomOrDefaultViewName('', '/user/123')).toBe('/user/?')
    })

    it('should return the custom view name for various URL paths', () => {
      expect(getCustomOrDefaultViewName('Home Page', '/')).toBe('Home Page')
      expect(getCustomOrDefaultViewName('User Profile', '/user/342')).toBe('User Profile')
      expect(getCustomOrDefaultViewName('API Endpoint', '/v1/user/3A2/profile')).toBe('API Endpoint')
    })
  })

  describe('when customViewName is undefined', () => {
    it('should fall back to default view name for empty path', () => {
      expect(getCustomOrDefaultViewName(undefined, '')).toBe('/')
    })

    it('should fall back to default view name for simple path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/user/342')).toBe('/user/?')
    })

    it('should fall back to default view name for alphanumeric path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/user/3A2')).toBe('/user/?')
    })

    it('should fall back to default view name for versioned path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/v1/user/3A2')).toBe('/v1/user/?')
    })

    it('should fall back to default view name for complex path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/v1/user/3A2/profile/2A3')).toBe('/v1/user/?/profile/?')
    })

    it('should fall back to default view name for UUID path', () => {
      expect(getCustomOrDefaultViewName(undefined, '/v1/user/dc893c65-a46d-4f63-a7be-e119b97b1b32/profile/2A3')).toBe(
        '/v1/user/?/profile/?'
      )
    })
  })

  describe('edge cases', () => {
    it('should handle null customViewName (treated as undefined)', () => {
      expect(getCustomOrDefaultViewName(null as any, '/user/123')).toBe('/user/?')
    })

    it('should handle customViewName with special characters', () => {
      expect(getCustomOrDefaultViewName('Special & Characters!', '/user/123')).toBe('Special & Characters!')
    })

    it('should handle very long custom view names', () => {
      const longName = 'A'.repeat(1000)
      expect(getCustomOrDefaultViewName(longName, '/user/123')).toBe(longName)
    })

    it('should handle customViewName that matches the default pattern', () => {
      expect(getCustomOrDefaultViewName('/user/?', '/user/123')).toBe('/user/?')
    })
  })
})

// Replicating the tests from SimpleUrlGroupingProcessorTest.java
describe('getDefaultViewName', () => {
  describe('url grouping', () => {
    it('should handle empty path', () => {
      expect(getDefaultViewName('')).toBe('/')
    })

    it('should handle simple URL path with numeric ID', () => {
      expect(getDefaultViewName('/user/342')).toBe('/user/?')
    })

    it('should handle URL path with alphanumeric ID', () => {
      expect(getDefaultViewName('/user/3A2')).toBe('/user/?')
    })

    it('should handle versioned URL path with alphanumeric ID', () => {
      expect(getDefaultViewName('/v1/user/3A2')).toBe('/v1/user/?')
    })

    it('should handle versioned URL path with alphanumeric ID and additional segments', () => {
      expect(getDefaultViewName('/v1/user/3A2/profile')).toBe('/v1/user/?/profile')
    })

    it('should handle multiple alphanumeric segments', () => {
      expect(getDefaultViewName('/v1/user/3A2/profile/2A3')).toBe('/v1/user/?/profile/?')
    })

    it('should handle UUID and alphanumeric segments', () => {
      expect(getDefaultViewName('/v1/user/dc893c65-a46d-4f63-a7be-e119b97b1b32/profile/2A3')).toBe(
        '/v1/user/?/profile/?'
      )
    })

    it('should not touch text-only segments', () => {
      expect(getDefaultViewName('/v1/user/explorer')).toBe('/v1/user/explorer')
    })
  })
})
