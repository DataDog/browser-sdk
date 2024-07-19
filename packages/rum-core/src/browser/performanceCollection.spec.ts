import type { TestSetupBuilder } from '../../test'
import { createPerformanceEntry, mockPerformanceObserver, setup } from '../../test'
import { LifeCycleEventType } from '../domain/lifeCycle'
import { startPerformanceCollection } from './performanceCollection'
import { RumPerformanceEntryType, type RumPerformanceEntry } from './performanceObservable'

describe('startPerformanceCollection', () => {
  let notifyPerformanceEntries: (entry: RumPerformanceEntry[]) => void
  let entryCollectedCallback: jasmine.Spy
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    entryCollectedCallback = jasmine.createSpy()
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    setupBuilder = setup().beforeBuild(({ lifeCycle, configuration }) => {
      const stop = startPerformanceCollection(lifeCycle, configuration)
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
    RumPerformanceEntryType.NAVIGATION,
    RumPerformanceEntryType.LONG_TASK,
    RumPerformanceEntryType.PAINT,
    RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT,
    RumPerformanceEntryType.FIRST_INPUT,
    RumPerformanceEntryType.LAYOUT_SHIFT,
    RumPerformanceEntryType.EVENT,
  ].forEach((entryType) => {
    it(`should notify ${entryType}`, () => {
      setupBuilder.build()

      notifyPerformanceEntries([createPerformanceEntry(entryType)])

      expect(entryCollectedCallback).toHaveBeenCalledWith([jasmine.objectContaining({ entryType })])
    })
  })

  it('should not notify resource timings', () => {
    setupBuilder.build()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])

    expect(entryCollectedCallback).not.toHaveBeenCalled()
  })
})
