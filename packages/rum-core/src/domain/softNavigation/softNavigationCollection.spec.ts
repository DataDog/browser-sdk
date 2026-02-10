import type { Duration, RelativeTime } from '@datadog/browser-core'
import { ExperimentalFeature, display } from '@datadog/browser-core'
import { mockExperimentalFeatures, registerCleanupTask } from '@datadog/browser-core/test'
import { createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../test'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { startSoftNavigationCollection } from './softNavigationCollection'

describe('softNavigationCollection', () => {
  function setupSoftNavigationCollection({
    supportedEntryTypes,
    enableFeature = true,
  }: {
    supportedEntryTypes?: RumPerformanceEntryType[]
    enableFeature?: boolean
  } = {}) {
    if (enableFeature) {
      mockExperimentalFeatures([ExperimentalFeature.SOFT_NAVIGATION])
    }

    const { notifyPerformanceEntries } = mockPerformanceObserver({
      supportedEntryTypes: supportedEntryTypes ?? undefined,
    })

    const { stop, softNavigationContexts } = startSoftNavigationCollection(mockRumConfiguration())

    registerCleanupTask(() => {
      stop()
    })

    return { notifyPerformanceEntries, softNavigationContexts, stop }
  }

  describe('when feature is enabled and browser supports soft-navigation', () => {
    it('should collect soft navigation entries and make them queryable by time', () => {
      const { notifyPerformanceEntries, softNavigationContexts } = setupSoftNavigationCollection()
      const entry = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION)

      notifyPerformanceEntries([entry])

      const context = softNavigationContexts.findSoftNavigationByTime(5000 as RelativeTime)
      expect(context).toEqual({
        navigationId: 'abc123',
        name: 'https://example.com/page',
        startTime: 5000 as RelativeTime,
      })
    })

    it('should store entry with correct navigationId, name, and startTime', () => {
      const { notifyPerformanceEntries, softNavigationContexts } = setupSoftNavigationCollection()
      const entry = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 2000 as RelativeTime,
        navigationId: 'custom-nav-id',
        name: 'https://example.com/custom',
      })

      notifyPerformanceEntries([entry])

      expect(softNavigationContexts.findSoftNavigationByTime(2000 as RelativeTime)).toEqual({
        navigationId: 'custom-nav-id',
        name: 'https://example.com/custom',
        startTime: 2000 as RelativeTime,
      })
    })

    it('should close previous active entry when new entry arrives', () => {
      const { notifyPerformanceEntries, softNavigationContexts } = setupSoftNavigationCollection()
      const entryA = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        navigationId: 'nav-a',
        name: 'https://example.com/a',
      })
      const entryB = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 2000 as RelativeTime,
        navigationId: 'nav-b',
        name: 'https://example.com/b',
      })

      notifyPerformanceEntries([entryA])
      notifyPerformanceEntries([entryB])

      expect(softNavigationContexts.findSoftNavigationByTime(1000 as RelativeTime)).toEqual(
        jasmine.objectContaining({ navigationId: 'nav-a' })
      )
      expect(softNavigationContexts.findSoftNavigationByTime(1500 as RelativeTime)).toEqual(
        jasmine.objectContaining({ navigationId: 'nav-a' })
      )
      expect(softNavigationContexts.findSoftNavigationByTime(2000 as RelativeTime)).toEqual(
        jasmine.objectContaining({ navigationId: 'nav-b' })
      )
      expect(softNavigationContexts.findSoftNavigationByTime(999 as RelativeTime)).toBeUndefined()
    })

    it('should find all soft navigation contexts overlapping a time range', () => {
      const { notifyPerformanceEntries, softNavigationContexts } = setupSoftNavigationCollection()
      const entryA = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        navigationId: 'nav-a',
        name: 'https://example.com/a',
      })
      const entryB = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 3000 as RelativeTime,
        navigationId: 'nav-b',
        name: 'https://example.com/b',
      })

      notifyPerformanceEntries([entryA])
      notifyPerformanceEntries([entryB])

      // Range [500, 4500] overlaps both entries
      const allContexts = softNavigationContexts.findAll(500 as RelativeTime, 4000 as Duration)
      expect(allContexts.length).toBe(2)
      expect(allContexts).toContain(jasmine.objectContaining({ navigationId: 'nav-a' }))
      expect(allContexts).toContain(jasmine.objectContaining({ navigationId: 'nav-b' }))

      // Range [2500, 2600] overlaps only entryA (entryA spans [1000, 3000], entryB starts at 3000)
      const singleContext = softNavigationContexts.findAll(2500 as RelativeTime, 100 as Duration)
      expect(singleContext.length).toBe(1)
      expect(singleContext[0]).toEqual(jasmine.objectContaining({ navigationId: 'nav-a' }))
    })

    it('should return undefined for query times before any entry', () => {
      const { notifyPerformanceEntries, softNavigationContexts } = setupSoftNavigationCollection()
      const entry = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION)

      notifyPerformanceEntries([entry])

      expect(softNavigationContexts.findSoftNavigationByTime(1000 as RelativeTime)).toBeUndefined()
    })

    it('should handle multiple entries notified in a single batch', () => {
      const { notifyPerformanceEntries, softNavigationContexts } = setupSoftNavigationCollection()
      const entryA = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        navigationId: 'batch-a',
        name: 'https://example.com/batch-a',
      })
      const entryB = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 2000 as RelativeTime,
        navigationId: 'batch-b',
        name: 'https://example.com/batch-b',
      })

      notifyPerformanceEntries([entryA, entryB])

      expect(softNavigationContexts.findSoftNavigationByTime(1000 as RelativeTime)).toEqual(
        jasmine.objectContaining({ navigationId: 'batch-a' })
      )
      expect(softNavigationContexts.findSoftNavigationByTime(2000 as RelativeTime)).toEqual(
        jasmine.objectContaining({ navigationId: 'batch-b' })
      )
    })

    it('should not collect new entries after stop()', () => {
      const { notifyPerformanceEntries, softNavigationContexts, stop } = setupSoftNavigationCollection()
      const entryA = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        navigationId: 'before-stop',
        name: 'https://example.com/before',
      })

      notifyPerformanceEntries([entryA])
      expect(softNavigationContexts.findSoftNavigationByTime(1000 as RelativeTime)).toEqual(
        jasmine.objectContaining({ navigationId: 'before-stop' })
      )

      stop()

      const entryB = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 5000 as RelativeTime,
        navigationId: 'after-stop',
        name: 'https://example.com/after',
      })
      notifyPerformanceEntries([entryB])

      // entryB should not have been collected (observer disconnected), so querying at 5000
      // still returns entryA (which remains open with endTime=Infinity)
      const context = softNavigationContexts.findSoftNavigationByTime(5000 as RelativeTime)
      expect(context).toEqual(jasmine.objectContaining({ navigationId: 'before-stop' }))
      expect(context).not.toEqual(jasmine.objectContaining({ navigationId: 'after-stop' }))
    })
  })

  describe('when feature is disabled', () => {
    it('should return noop contexts when feature is disabled', () => {
      const { notifyPerformanceEntries, softNavigationContexts } = setupSoftNavigationCollection({ enableFeature: false })
      const entry = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION)

      notifyPerformanceEntries([entry])

      expect(softNavigationContexts.findSoftNavigationByTime(5000 as RelativeTime)).toBeUndefined()
      expect(softNavigationContexts.findAll()).toEqual([])
    })

    it('should not throw errors when entries are notified with feature disabled', () => {
      const { notifyPerformanceEntries } = setupSoftNavigationCollection({ enableFeature: false })
      const entry = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION)

      expect(() => notifyPerformanceEntries([entry])).not.toThrow()
    })
  })

  describe('when browser does not support soft-navigation', () => {
    it('should return noop contexts when browser does not support soft-navigation', () => {
      const { notifyPerformanceEntries, softNavigationContexts } = setupSoftNavigationCollection({
        supportedEntryTypes: [RumPerformanceEntryType.LONG_TASK],
      })
      const entry = createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION)

      notifyPerformanceEntries([entry])

      expect(softNavigationContexts.findSoftNavigationByTime(5000 as RelativeTime)).toBeUndefined()
    })

    it('should log a debug message when browser does not support soft-navigation', () => {
      const debugSpy = spyOn(display, 'debug')

      setupSoftNavigationCollection({
        supportedEntryTypes: [RumPerformanceEntryType.LONG_TASK],
      })

      expect(debugSpy).toHaveBeenCalledWith('Soft navigation is not supported by this browser.')
    })
  })
})
