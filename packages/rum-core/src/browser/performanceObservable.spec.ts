import type { Subscription } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { RumConfiguration } from '../domain/configuration'
import { createPerformanceEntry, mockPerformanceObserver } from '../../test'
import type { RumPerformanceEntry } from './performanceObservable'
import { RumPerformanceEntryType, createPerformanceObservable } from './performanceObservable'

describe('performanceObservable', () => {
  let configuration: RumConfiguration
  let performanceSubscription: Subscription | undefined
  const forbiddenUrl = 'https://forbidden.url'
  const allowedUrl = 'https://allowed.url'
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  let observableCallback: jasmine.Spy
  let clock: Clock

  beforeEach(() => {
    if (!window.PerformanceObserver) {
      pending('PerformanceObserver not supported')
    }
    observableCallback = jasmine.createSpy()
    configuration = { isIntakeUrl: (url: string) => url === forbiddenUrl } as unknown as RumConfiguration
    clock = mockClock()
  })

  afterEach(() => {
    performanceSubscription?.unsubscribe()
    clock?.cleanup()
  })

  describe('primary strategy when type supported', () => {
    beforeEach(() => {
      ;({ notifyPerformanceEntries } = mockPerformanceObserver())
    })

    it('should notify performance resources', () => {
      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })])
      expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
    })

    it('should not notify forbidden performance resources', () => {
      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: forbiddenUrl })])
      expect(observableCallback).not.toHaveBeenCalled()
    })

    it('should notify buffered performance resources asynchronously', () => {
      // add the performance entry to the buffer
      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })])

      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
        buffered: true,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)
      expect(observableCallback).not.toHaveBeenCalled()
      clock.tick(0)
      expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
    })
  })

  describe('fallback strategy when type not supported', () => {
    let bufferedEntries: PerformanceEntryList

    beforeEach(() => {
      bufferedEntries = []
      spyOn(performance, 'getEntriesByType').and.callFake(() => bufferedEntries)
      ;({ notifyPerformanceEntries } = mockPerformanceObserver({ typeSupported: false }))
    })

    it('should notify performance resources when type not supported', () => {
      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })])
      expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
    })

    it('should notify buffered performance resources when type not supported', () => {
      // add the performance entry to the buffer
      bufferedEntries = [createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })]

      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
        buffered: true,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)
      expect(observableCallback).not.toHaveBeenCalled()
      clock.tick(0)
      expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
    })
  })
})
