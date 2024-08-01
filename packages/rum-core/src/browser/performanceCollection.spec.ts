import { createPerformanceEntry, mockPerformanceObserver } from '../../test'
import type { RumConfiguration } from '../domain/configuration'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startPerformanceCollection } from './performanceCollection'
import { RumPerformanceEntryType } from './performanceObservable'

describe('startPerformanceCollection', () => {
  const lifeCycle = new LifeCycle()
  const configuration = {} as RumConfiguration
  let entryCollectedCallback: jasmine.Spy
  let stopPerformanceCollection: () => void

  function setupStartPerformanceCollection() {
    entryCollectedCallback = jasmine.createSpy()
    const { stop } = startPerformanceCollection(lifeCycle, configuration)
    const subscription = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, entryCollectedCallback)

    stopPerformanceCollection = () => {
      stop()
      subscription.unsubscribe()
    }
  }

  afterEach(() => {
    stopPerformanceCollection()
  })
  ;[
    RumPerformanceEntryType.LONG_TASK,
    RumPerformanceEntryType.PAINT,
    RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT,
    RumPerformanceEntryType.FIRST_INPUT,
    RumPerformanceEntryType.LAYOUT_SHIFT,
    RumPerformanceEntryType.EVENT,
  ].forEach((entryType) => {
    it(`should notify ${entryType}`, () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver()
      setupStartPerformanceCollection()

      notifyPerformanceEntries([createPerformanceEntry(entryType)])

      expect(entryCollectedCallback).toHaveBeenCalledWith([jasmine.objectContaining({ entryType })])
    })
  })
  ;[(RumPerformanceEntryType.NAVIGATION, RumPerformanceEntryType.RESOURCE)].forEach((entryType) => {
    it(`should not notify ${entryType} timings`, () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver()
      setupStartPerformanceCollection()

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])

      expect(entryCollectedCallback).not.toHaveBeenCalled()
    })
  })

  it('should handle exceptions coming from performance observer .observe()', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver({
      emulateAllEntryTypesUnsupported: true,
    })
    setupStartPerformanceCollection()

    expect(() => notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])).not.toThrow()

    expect(entryCollectedCallback).not.toHaveBeenCalled()
  })
})
