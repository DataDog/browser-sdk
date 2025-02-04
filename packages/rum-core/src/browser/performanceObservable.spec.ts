import type { Duration, Subscription } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { GlobalPerformanceBufferMock } from '../../test'
import {
  createPerformanceEntry,
  mockGlobalPerformanceBuffer,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../test'
import { RumPerformanceEntryType, createPerformanceObservable } from './performanceObservable'

describe('performanceObservable', () => {
  let performanceSubscription: Subscription | undefined
  const configuration = mockRumConfiguration()
  const forbiddenUrl = 'https://forbidden.url/abce?ddsource=browser&ddtags=sdk_version'
  const allowedUrl = 'https://allowed.url'
  let observableCallback: jasmine.Spy
  let clock: Clock

  beforeEach(() => {
    if (!window.PerformanceObserver) {
      pending('PerformanceObserver not supported')
    }
    observableCallback = jasmine.createSpy()
    clock = mockClock()
  })

  afterEach(() => {
    performanceSubscription?.unsubscribe()
    clock?.cleanup()
  })

  describe('primary strategy when type supported', () => {
    it('should notify performance resources', () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver()
      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })])
      expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
    })

    it('should not notify performance resources with intake url', () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver()
      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: forbiddenUrl })])
      expect(observableCallback).not.toHaveBeenCalled()
    })

    it('should not notify performance resources with invalid duration', () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver()
      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { duration: -1 as Duration })])
      expect(observableCallback).not.toHaveBeenCalled()
    })

    it('should notify buffered performance resources asynchronously', () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver()
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
    let globalPerformanceBufferMock: GlobalPerformanceBufferMock

    beforeEach(() => {
      globalPerformanceBufferMock = mockGlobalPerformanceBuffer()
    })

    it('should notify performance resources when type not supported', () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver({ typeSupported: false })
      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })])
      expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
    })

    it('should notify buffered performance resources when type not supported', () => {
      mockPerformanceObserver({ typeSupported: false })
      // add the performance entry to the buffer
      globalPerformanceBufferMock.addPerformanceEntry(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })
      )

      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
        buffered: true,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)
      expect(observableCallback).not.toHaveBeenCalled()
      clock.tick(0)
      expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
    })

    it('should handle exceptions coming from performance observer .observe()', () => {
      const { notifyPerformanceEntries } = mockPerformanceObserver({
        typeSupported: false,
        emulateAllEntryTypesUnsupported: true,
      })
      const performanceResourceObservable = createPerformanceObservable(configuration, {
        type: RumPerformanceEntryType.RESOURCE,
        buffered: true,
      })
      performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE)])
      expect(observableCallback).not.toHaveBeenCalled()
    })
  })
})
