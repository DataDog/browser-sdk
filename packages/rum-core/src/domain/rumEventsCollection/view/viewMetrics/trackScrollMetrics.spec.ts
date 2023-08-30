import type { RelativeTime, TimeStamp, Duration } from '@datadog/browser-core'
import { Observable, DOM_EVENT } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../../../test'
import { setup } from '../../../../../test'
import type { RumConfiguration } from '../../../configuration'
import type { ViewTest } from '../setupViewTest.specHelper'
import { setupViewTest } from '../setupViewTest.specHelper'
import { THROTTLE_SCROLL_DURATION, type ScrollMetrics, trackScrollMetrics } from './trackScrollMetrics'

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
    const scrollHeightObservable: Observable<number> = new Observable()

    const getMetrics = jasmine.createSpy('getMetrics')

    const mockGetMetrics = (scrollParams: { scrollHeight: number; scrollDepth: number; scrollTop: number }) => {
      getMetrics.and.returnValue(scrollParams)
    }

    const emitObservableValue = (scrollParams: { scrollHeight: number; scrollDepth: number; scrollTop: number }) => {
      mockGetMetrics({ ...scrollParams, scrollHeight: 0 })
      scrollHeightObservable.notify(scrollParams.scrollHeight)
    }

    const newScroll = (scrollParams: { scrollHeight: number; scrollDepth: number; scrollTop: number }) => {
      mockGetMetrics(scrollParams)
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
        scrollHeightObservable,
        getMetrics
      ).stop
    })

    afterEach(() => {
      stopTrackScrollMetrics()
      scrollMetrics = undefined
      clock.cleanup()
    })

    it('should initially be undefined', () => {
      expect(scrollMetrics).toBeUndefined()
    })

    it('should update scroll metrics before scrolling', () => {
      emitObservableValue({
        scrollHeight: 99,
        scrollDepth: 99,
        scrollTop: 99,
      })
      expect(scrollMetrics).toEqual({
        maxDepthScrollHeight: 99,
        maxDepth: 99,
        maxDepthScrollTop: 99,
        maxDepthTime: 0 as Duration,
      })
    })

    it('should update scroll metrics when scrolling the first time, ignoring subsequent values emitted by the observable', () => {
      newScroll({ scrollHeight: 1000, scrollDepth: 500, scrollTop: 100 })
      emitObservableValue({
        scrollHeight: 9999,
        scrollDepth: 9999,
        scrollTop: 9999,
      })
      expect(scrollMetrics).toEqual({
        maxDepthScrollHeight: 1000,
        maxDepth: 500,
        maxDepthScrollTop: 100,
        maxDepthTime: 1000 as Duration,
      })
    })

    it('should update scroll metrics when scroll depth has increased, still ignoring values emitted by the observable', () => {
      newScroll({ scrollHeight: 1000, scrollDepth: 500, scrollTop: 100 })
      newScroll({ scrollHeight: 1000, scrollDepth: 600, scrollTop: 200 })

      emitObservableValue({
        scrollHeight: 9999,
        scrollDepth: 9999,
        scrollTop: 9999,
      })

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

      emitObservableValue({
        scrollHeight: 9999,
        scrollDepth: 9999,
        scrollTop: 9999,
      })

      expect(scrollMetrics).toEqual({
        maxDepthScrollHeight: 1000,
        maxDepth: 600,
        maxDepthScrollTop: 200,
        maxDepthTime: 1000 as Duration,
      })
    })
  })
})
