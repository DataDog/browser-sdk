import { vi } from 'vitest'
import type { RelativeTime } from '@datadog/browser-core'
import { replaceMockable } from '@datadog/browser-core/test'
import { createPerformanceEntry, mockDocumentReadyState, mockRumConfiguration } from '../../../test'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { getNavigationEntry } from '../../browser/performanceUtils'
import { FAKE_INITIAL_DOCUMENT } from './resourceUtils'
import { retrieveInitialDocumentResourceTiming } from './retrieveInitialDocumentResourceTiming'

describe('rum initial document resource', () => {
  it('creates a resource timing for the initial document', (done) => {
    retrieveInitialDocumentResourceTiming(mockRumConfiguration(), (timing) => {
      expect(timing.entryType).toBe('resource')
      expect(timing.initiatorType).toBe(FAKE_INITIAL_DOCUMENT)
      expect(timing.duration).toBeGreaterThan(0)

      // generate a performance entry like structure
      const toJsonTiming = timing.toJSON()
      expect(toJsonTiming.entryType).toEqual(timing.entryType)
      expect(toJsonTiming.duration).toEqual(timing.duration)
      expect((toJsonTiming as any).toJSON).toBeUndefined()
      done()
    })
  })

  it('waits until the document is interactive to notify the resource', () => {
    const { triggerOnDomLoaded } = mockDocumentReadyState()
    const spy = vi.fn()
    retrieveInitialDocumentResourceTiming(mockRumConfiguration(), spy)
    expect(spy).not.toHaveBeenCalled()
    triggerOnDomLoaded()
    expect(spy).toHaveBeenCalled()
  })

  it('uses the responseEnd to define the resource duration', (done) => {
    replaceMockable(getNavigationEntry, () =>
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
        responseEnd: 100 as RelativeTime,
        duration: 200 as RelativeTime,
      })
    )

    retrieveInitialDocumentResourceTiming(mockRumConfiguration(), (timing) => {
      expect(timing.duration).toBe(100 as RelativeTime)
      done()
    })
  })
})
