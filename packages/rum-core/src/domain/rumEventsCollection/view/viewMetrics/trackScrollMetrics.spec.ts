import type { RelativeTime, TimeStamp, Duration } from '@datadog/browser-core'
import { DOM_EVENT } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../../../test'
import { setup } from '../../../../../test'
import { PAGE_ACTIVITY_END_DELAY, PAGE_ACTIVITY_VALIDATION_DELAY } from '../../../waitPageActivityEnd'
import type { RumConfiguration } from '../../../configuration'
import { THROTTLE_VIEW_UPDATE_PERIOD } from '../trackViews'
import type { ViewTest } from '../setupViewTest.specHelper'
import { setupViewTest } from '../setupViewTest.specHelper'
import { THROTTLE_SCROLL_DURATION, type ScrollMetrics, trackScrollMetrics } from './trackScrollMetrics'

const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = (PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as Duration

const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

describe('trackScrollMetrics', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('on scroll', () => {
    let scrollMetrics: ScrollMetrics | undefined
    let stopTrackScrollMetrics: () => void
    let clock: Clock
    let configuration: RumConfiguration

    const getMetrics = jasmine.createSpy('getMetrics')

    const newScroll = (scrollParams: { scrollHeight: number; scrollDepth: number; scrollTop: number }) => {
      getMetrics.and.returnValue(scrollParams)

      window.dispatchEvent(createNewEvent(DOM_EVENT.SCROLL))

      clock.tick(THROTTLE_SCROLL_DURATION)
    }

    beforeEach(() => {
      configuration = {} as RumConfiguration
      clock = mockClock()
      stopTrackScrollMetrics = trackScrollMetrics(
        configuration,
        { relative: 0 as RelativeTime, timeStamp: 0 as TimeStamp },
        (s) => (scrollMetrics = s),
        getMetrics
      ).stop
    })

    afterEach(() => {
      stopTrackScrollMetrics()
      scrollMetrics = undefined
      clock.cleanup()
    })

    it('should update scroll metrics when scrolling the first time', () => {
      newScroll({ scrollHeight: 1000, scrollDepth: 500, scrollTop: 100 })

      expect(scrollMetrics).toEqual({
        maxDepthScrollHeight: 1000,
        maxDepth: 500,
        maxDepthScrollTop: 100,
        maxDepthTime: 1000 as Duration,
      })
    })

    it('should update scroll metrics when scroll depth has increased', () => {
      newScroll({ scrollHeight: 1000, scrollDepth: 500, scrollTop: 100 })

      newScroll({ scrollHeight: 1000, scrollDepth: 600, scrollTop: 200 })

      expect(scrollMetrics).toEqual({
        maxDepthScrollHeight: 1000,
        maxDepth: 600,
        maxDepthScrollTop: 200,
        maxDepthTime: 2000 as Duration,
      })
    })

    it('should NOT update scroll metrics when scroll depth has not increased', () => {
      newScroll({ scrollHeight: 1000, scrollDepth: 600, scrollTop: 200 })

      newScroll({ scrollHeight: 1000, scrollDepth: 450, scrollTop: 50 })

      expect(scrollMetrics).toEqual({
        maxDepthScrollHeight: 1000,
        maxDepth: 600,
        maxDepthScrollTop: 200,
        maxDepthTime: 1000 as Duration,
      })
    })
  })

  describe('on load', () => {
    beforeEach(() => {
      setupBuilder.withFakeClock()
    })

    it('should have an undefined loading time and empty scroll metrics if there is no activity on a route change', () => {
      const { clock } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      startView()
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(2).commonViewMetrics.loadingTime).toBeUndefined()
      expect(getViewUpdate(2).commonViewMetrics.scroll).toEqual(undefined)
    })

    it('should have a loading time equal to the activity time and scroll metrics if there is a unique activity on a route change', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      const { getViewUpdate, startView } = viewTest

      startView()
      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      domMutationObservable.notify()
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdate(3).commonViewMetrics.loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      expect(getViewUpdate(3).commonViewMetrics.scroll).toEqual({
        maxDepthScrollHeight: jasmine.any(Number),
        maxDepth: jasmine.any(Number),
        maxDepthTime: jasmine.any(Number),
        maxDepthScrollTop: jasmine.any(Number),
      })
    })
  })
})
