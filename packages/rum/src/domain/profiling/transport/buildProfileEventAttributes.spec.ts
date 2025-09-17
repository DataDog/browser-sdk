import { clocksOrigin } from '@datadog/browser-core'
import type { RumProfilerTrace, RumViewEntry, RUMProfilerLongTaskEntry } from '../types'
import { buildProfileEventAttributes, type ProfileEventAttributes } from './buildProfileEventAttributes'

describe('buildProfileEventAttributes', () => {
  const applicationId = 'test-app-id'
  const sessionId = 'test-session-id'

  function createMockViewEntry(overrides: Partial<RumViewEntry> = {}): RumViewEntry {
    return {
      startClocks: clocksOrigin(),
      viewId: 'view-123',
      viewName: 'Home Page',
      ...overrides,
    }
  }

  function createMockLongTaskEntry(overrides: Partial<RUMProfilerLongTaskEntry> = {}): RUMProfilerLongTaskEntry {
    return {
      id: 'longtask-456',
      duration: 100 as any,
      entryType: 'longtask',
      startClocks: clocksOrigin(),
      ...overrides,
    }
  }

  function createMockProfilerTrace(overrides: Partial<RumProfilerTrace> = {}): RumProfilerTrace {
    return {
      startClocks: clocksOrigin(),
      endClocks: clocksOrigin(),
      clocksOrigin: clocksOrigin(),
      sampleInterval: 10,
      views: [],
      longTasks: [],
      resources: [],
      frames: [],
      stacks: [],
      samples: [],
      ...overrides,
    }
  }

  describe('when creating basic profile event attributes', () => {
    it('should include application id', () => {
      const profilerTrace = createMockProfilerTrace()

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.application).toEqual({ id: applicationId })
    })

    it('should include session id when provided', () => {
      const profilerTrace = createMockProfilerTrace()

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.session).toEqual({ id: sessionId })
    })

    it('should omit session when sessionId is undefined', () => {
      const profilerTrace = createMockProfilerTrace()

      const result = buildProfileEventAttributes(profilerTrace, applicationId, undefined)

      expect(result.session).toBeUndefined()
    })

    it('should omit session when sessionId is empty string', () => {
      const profilerTrace = createMockProfilerTrace()

      const result = buildProfileEventAttributes(profilerTrace, applicationId, '')

      expect(result.session).toBeUndefined()
    })
  })

  describe('when handling views', () => {
    it('should extract view ids and names from single view', () => {
      const view = createMockViewEntry({
        viewId: 'view-123',
        viewName: 'Home Page',
      })
      const profilerTrace = createMockProfilerTrace({ views: [view] })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view).toEqual({
        id: ['view-123'],
        name: ['Home Page'],
      })
    })

    it('should extract view ids and names from multiple views', () => {
      const views = [
        createMockViewEntry({ viewId: 'view-123', viewName: 'Home Page' }),
        createMockViewEntry({ viewId: 'view-456', viewName: 'About Page' }),
        createMockViewEntry({ viewId: 'view-789', viewName: 'Contact Page' }),
      ]
      const profilerTrace = createMockProfilerTrace({ views })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view).toEqual({
        id: ['view-123', 'view-456', 'view-789'],
        name: ['Home Page', 'About Page', 'Contact Page'],
      })
    })

    it('should handle views with undefined names', () => {
      const views = [
        createMockViewEntry({ viewId: 'view-123', viewName: 'Home Page' }),
        createMockViewEntry({ viewId: 'view-456', viewName: undefined }),
        createMockViewEntry({ viewId: 'view-789', viewName: 'Contact Page' }),
      ]
      const profilerTrace = createMockProfilerTrace({ views })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view).toEqual({
        id: ['view-123', 'view-456', 'view-789'],
        name: ['Home Page', 'Contact Page'],
      })
    })

    it('should remove duplicate view names', () => {
      const views = [
        createMockViewEntry({ viewId: 'view-123', viewName: 'Home Page' }),
        createMockViewEntry({ viewId: 'view-456', viewName: 'Home Page' }),
        createMockViewEntry({ viewId: 'view-789', viewName: 'About Page' }),
        createMockViewEntry({ viewId: 'view-abc', viewName: 'Home Page' }),
      ]
      const profilerTrace = createMockProfilerTrace({ views })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view).toEqual({
        id: ['view-123', 'view-456', 'view-789', 'view-abc'],
        name: ['Home Page', 'About Page'],
      })
    })

    it('should handle all views without names', () => {
      const views = [
        createMockViewEntry({ viewId: 'view-123', viewName: undefined }),
        createMockViewEntry({ viewId: 'view-456', viewName: undefined }),
      ]
      const profilerTrace = createMockProfilerTrace({ views })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view).toEqual({
        id: ['view-123', 'view-456'],
        name: [],
      })
    })

    it('should omit view attribute when no views are present', () => {
      const profilerTrace = createMockProfilerTrace({ views: [] })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view).toBeUndefined()
    })
  })

  describe('when handling long tasks', () => {
    it('should extract long task ids from single long task', () => {
      const longTask = createMockLongTaskEntry({ id: 'longtask-123' })
      const profilerTrace = createMockProfilerTrace({ longTasks: [longTask] })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.long_task).toEqual({
        id: ['longtask-123'],
      })
    })

    it('should extract long task ids from multiple long tasks', () => {
      const longTasks = [
        createMockLongTaskEntry({ id: 'longtask-123' }),
        createMockLongTaskEntry({ id: 'longtask-456' }),
        createMockLongTaskEntry({ id: 'longtask-789' }),
      ]
      const profilerTrace = createMockProfilerTrace({ longTasks })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.long_task).toEqual({
        id: ['longtask-123', 'longtask-456', 'longtask-789'],
      })
    })

    it('should filter out long tasks with undefined ids', () => {
      const longTasks = [
        createMockLongTaskEntry({ id: 'longtask-123' }),
        createMockLongTaskEntry({ id: undefined }),
        createMockLongTaskEntry({ id: 'longtask-789' }),
      ]
      const profilerTrace = createMockProfilerTrace({ longTasks })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.long_task).toEqual({
        id: ['longtask-123', 'longtask-789'],
      })
    })

    it('should omit long_task attribute when no long tasks have ids', () => {
      const longTasks = [createMockLongTaskEntry({ id: undefined }), createMockLongTaskEntry({ id: undefined })]
      const profilerTrace = createMockProfilerTrace({ longTasks })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.long_task).toBeUndefined()
    })

    it('should omit long_task attribute when no long tasks are present', () => {
      const profilerTrace = createMockProfilerTrace({ longTasks: [] })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.long_task).toBeUndefined()
    })
  })

  describe('when handling complex scenarios', () => {
    it('should handle profiler trace with both views and long tasks', () => {
      const views = [
        createMockViewEntry({ viewId: 'view-123', viewName: 'Home Page' }),
        createMockViewEntry({ viewId: 'view-456', viewName: 'About Page' }),
      ]
      const longTasks = [
        createMockLongTaskEntry({ id: 'longtask-123' }),
        createMockLongTaskEntry({ id: 'longtask-456' }),
      ]
      const profilerTrace = createMockProfilerTrace({ views, longTasks })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      const expected: ProfileEventAttributes = {
        application: { id: applicationId },
        session: { id: sessionId },
        view: {
          id: ['view-123', 'view-456'],
          name: ['Home Page', 'About Page'],
        },
        long_task: {
          id: ['longtask-123', 'longtask-456'],
        },
      }

      expect(result).toEqual(expected)
    })

    it('should handle empty profiler trace', () => {
      const profilerTrace = createMockProfilerTrace()

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      const expected: ProfileEventAttributes = {
        application: { id: applicationId },
        session: { id: sessionId },
      }

      expect(result).toEqual(expected)
    })

    it('should handle profiler trace with empty string view names consistently', () => {
      const views = [
        createMockViewEntry({ viewId: 'view-123', viewName: '' }), // will be ignored
        createMockViewEntry({ viewId: 'view-456', viewName: 'Valid Page' }),
      ]
      const profilerTrace = createMockProfilerTrace({ views })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view).toEqual({
        id: ['view-123', 'view-456'],
        name: ['Valid Page'],
      })
    })
  })

  describe('edge cases', () => {
    it('should handle profiler trace with duplicate view names and mixed undefined names', () => {
      const views = [
        createMockViewEntry({ viewId: 'view-1', viewName: 'Page A' }),
        createMockViewEntry({ viewId: 'view-2', viewName: undefined }),
        createMockViewEntry({ viewId: 'view-3', viewName: 'Page A' }),
        createMockViewEntry({ viewId: 'view-4', viewName: 'Page B' }),
        createMockViewEntry({ viewId: 'view-5', viewName: undefined }),
        createMockViewEntry({ viewId: 'view-6', viewName: 'Page A' }),
      ]
      const profilerTrace = createMockProfilerTrace({ views })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view).toEqual({
        id: ['view-1', 'view-2', 'view-3', 'view-4', 'view-5', 'view-6'],
        name: ['Page A', 'Page B'], // Duplicates removed
      })
    })

    it('should preserve order of view ids but deduplicate names', () => {
      const views = [
        createMockViewEntry({ viewId: 'view-last', viewName: 'Page Z' }),
        createMockViewEntry({ viewId: 'view-first', viewName: 'Page A' }),
        createMockViewEntry({ viewId: 'view-middle', viewName: 'Page Z' }), // Duplicate name
      ]
      const profilerTrace = createMockProfilerTrace({ views })

      const result = buildProfileEventAttributes(profilerTrace, applicationId, sessionId)

      expect(result.view?.id).toEqual(['view-last', 'view-first', 'view-middle'])
      expect(result.view?.name).toEqual(['Page Z', 'Page A']) // Order based on first occurrence
    })
  })
})
