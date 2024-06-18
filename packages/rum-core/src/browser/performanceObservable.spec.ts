import type { Subscription } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import { createPerformanceEntry, mockPerformanceObserver } from '../../test'
import type { RumPerformanceEntry } from './performanceObservable'
import { RumPerformanceEntryType, createPerformanceObservable } from './performanceObservable'

describe('performanceObservable', () => {
  let configuration: RumConfiguration
  let performanceSubscription: Subscription
  const forbiddenUrl = 'https://forbidden.url'
  const allowedUrl = 'https://allowed.url'
  let notifyPerformanceEntry: (entry: RumPerformanceEntry) => void
  let observableCallback: jasmine.Spy

  beforeEach(() => {
    if (!window.PerformanceObserver) {
      pending('PerformanceObserver not supported')
    }
    observableCallback = jasmine.createSpy()
    configuration = { isIntakeUrl: (url) => url === forbiddenUrl } as RumConfiguration
    ;({ notifyPerformanceEntry } = mockPerformanceObserver())
  })

  afterEach(() => {
    performanceSubscription.unsubscribe()
  })

  it('should notify performance resources', () => {
    const performanceResourceObservable = createPerformanceObservable(configuration, {
      type: RumPerformanceEntryType.RESOURCE,
    })
    performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

    notifyPerformanceEntry(createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl }))
    expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
  })

  it('should not notify forbidden performance resources', () => {
    const performanceResourceObservable = createPerformanceObservable(configuration, {
      type: RumPerformanceEntryType.RESOURCE,
    })
    performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

    notifyPerformanceEntry(createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: forbiddenUrl }))
    expect(observableCallback).not.toHaveBeenCalled()
  })
})
