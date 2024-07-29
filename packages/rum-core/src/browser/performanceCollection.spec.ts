import type { TestSetupBuilder } from '../../test'
import { createPerformanceEntry, mockPerformanceObserver, setup } from '../../test'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { startPerformanceCollection } from './performanceCollection'
import { RumPerformanceEntryType } from './performanceObservable'

describe('startPerformanceCollection', () => {
  let entryCollectedCallback: jasmine.Spy
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    entryCollectedCallback = jasmine.createSpy()

    setupBuilder = setup().beforeBuild(({ lifeCycle, configuration }) => {
      const { stop } = startPerformanceCollection(lifeCycle, configuration)
      const subscription = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, entryCollectedCallback)
      return {
        stop() {
          stop()
          subscription.unsubscribe()
        },
      }
    })
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
      setupBuilder.build()

      notifyPerformanceEntries([createPerformanceEntry(entryType)])

      expect(entryCollectedCallback).toHaveBeenCalledWith([jasmine.objectContaining({ entryType })])
    })
  })
  ;[(RumPerformanceEntryType.NAVIGATION, RumPerformanceEntryType.RESOURCE)].forEach((entryType) => {
    it(`should not notify ${entryType} timings`, () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver()
      setupBuilder.build()

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])

      expect(entryCollectedCallback).not.toHaveBeenCalled()
    })
  })

  it('should handle exceptions coming from performance observer .observe()', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver({
      emulateAllEntryTypesUnsupported: true,
    })
    setupBuilder.build()

    expect(() => notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])).not.toThrow()

    expect(entryCollectedCallback).not.toHaveBeenCalled()
  })
})
