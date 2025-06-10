import type { RelativeTime } from '@datadog/browser-core'
import { createPerformanceEntry, mockDocumentReadyState, mockRumConfiguration } from '../../../test'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { FAKE_INITIAL_DOCUMENT } from './resourceUtils'
import { retrieveInitialDocumentResourceTiming } from './retrieveInitialDocumentResourceTiming'

describe('rum initial document resource', () => {
  afterEach(() => {
    if ((document as Document & { prerendering?: boolean })?.prerendering !== undefined) {
      delete (document as Document & { prerendering?: boolean })?.prerendering
    }
  })

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
    const spy = jasmine.createSpy()
    retrieveInitialDocumentResourceTiming(mockRumConfiguration(), spy)
    expect(spy).not.toHaveBeenCalled()
    triggerOnDomLoaded()
    expect(spy).toHaveBeenCalled()
  })

  it('uses the responseEnd to define the resource duration', (done) => {
    retrieveInitialDocumentResourceTiming(
      mockRumConfiguration(),
      (timing) => {
        expect(timing.duration).toBe(100 as RelativeTime)
        done()
      },
      () =>
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          responseEnd: 100 as RelativeTime,
          duration: 200 as RelativeTime,
        })
    )
  })
  describe('prerendering behavior', () => {
    it('adjusts timing values for prerendered pages with activationStart', (done) => {
      spyOnProperty(document as Document & { prerendering?: boolean }, 'prerendering', 'get').and.returnValue(false)

      retrieveInitialDocumentResourceTiming(
        mockRumConfiguration(),
        (timing) => {
          expect(timing.fetchStart).toBe(50 as RelativeTime)
          expect(timing.duration).toBe(50 as RelativeTime)
          done()
        },
        () =>
          createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
            fetchStart: 100 as RelativeTime,
            responseEnd: 100 as RelativeTime,
          }),
        () => 50 as RelativeTime
      )
    })

    it('sets deliveryType for pages that are currently prerendering', (done) => {
      spyOnProperty(document as Document & { prerendering?: boolean }, 'prerendering', 'get').and.returnValue(true)

      retrieveInitialDocumentResourceTiming(
        mockRumConfiguration(),
        (timing) => {
          expect(timing.deliveryType).toBe('navigational-prefetch')
          done()
        },
        () =>
          createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
            fetchStart: 100 as RelativeTime,
            responseEnd: 200 as RelativeTime,
            activationStart: 0 as RelativeTime,
          })
      )
    })

    it('does not adjust timing values for non-prerendered pages', (done) => {
      spyOnProperty(document as Document & { prerendering?: boolean }, 'prerendering', 'get').and.returnValue(false)

      retrieveInitialDocumentResourceTiming(
        mockRumConfiguration(),
        (timing) => {
          expect(timing.fetchStart).toBe(100 as RelativeTime)
          expect(timing.duration).toBe(200 as RelativeTime)
          done()
        },
        () =>
          createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
            fetchStart: 100 as RelativeTime,
            responseEnd: 200 as RelativeTime,
            activationStart: 0 as RelativeTime,
          })
      )
    })

    it('handles timing values that would become negative by clamping to 0', (done) => {
      spyOnProperty(document as Document & { prerendering?: boolean }, 'prerendering', 'get').and.returnValue(true)

      retrieveInitialDocumentResourceTiming(
        mockRumConfiguration(),
        (timing) => {
          expect(timing.fetchStart).toBe(0 as RelativeTime)
          expect(timing.responseStart).toBe(0 as RelativeTime)
          expect(timing.duration).toBe(0 as RelativeTime)
          done()
        },
        () =>
          createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
            fetchStart: 20 as RelativeTime,
            responseStart: 10 as RelativeTime,
            responseEnd: 40 as RelativeTime,
            activationStart: 50 as RelativeTime,
          }),
        () => 50 as RelativeTime
      )
    })
  })
})
