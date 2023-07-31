import type { RelativeTime, Duration, ServerDuration } from '@datadog/browser-core'
import { relativeNow } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import { mapToForegroundPeriods } from './foregroundContexts'
import type { PageStateHistory } from './pageStateHistory'
import { PageState, startPageStateHistory } from './pageStateHistory'

const FOCUS_PERIOD_LENGTH = 10 as Duration
const BLUR_PERIOD_LENGTH = 5 as Duration

describe('foreground context', () => {
  let setupBuilder: TestSetupBuilder
  let pageStateHistory: PageStateHistory
  let configuration: RumConfiguration

  function addNewForegroundPeriod() {
    pageStateHistory.addPageState(PageState.ACTIVE)
  }

  function closeForegroundPeriod() {
    pageStateHistory.addPageState(PageState.PASSIVE)
  }

  function selectInForegroundPeriodsFor(startTime: RelativeTime, duration: Duration) {
    const pageStates = pageStateHistory.findAll(startTime, duration)
    return mapToForegroundPeriods(pageStates || [], duration)
  }

  function isInForegroundAt(startTime: RelativeTime) {
    return pageStateHistory.isInActivePageStateAt(startTime)
  }

  beforeEach(() => {
    configuration = {} as RumConfiguration
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(() => {
        pageStateHistory = startPageStateHistory(configuration)
        return pageStateHistory
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('when the page do not have the focus when starting', () => {
    beforeEach(() => {
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => false)
      pageStateHistory = startPageStateHistory(configuration)
    })
    describe('without any focus nor blur event', () => {
      describe('isInForegroundAt', () => {
        it('should return false', () => {
          const { clock } = setupBuilder.build()

          clock.tick(1_000)

          expect(isInForegroundAt(relativeNow())).toEqual(false)
        })
      })

      describe('selectInForegroundPeriodsFor', () => {
        it('should an empty array', () => {
          const { clock } = setupBuilder.build()

          clock.tick(1_000)

          expect(selectInForegroundPeriodsFor(relativeNow(), 0 as Duration)).toEqual([])
        })
      })
    })

    describe('with two closed focus period & one active one', () => {
      /*
      events         F      B   F       B   F
      periods        <------>   <------->   <---- - - -
      time       0   5  10  15  20  25  30  35  40  45
      */
      beforeEach(() => {
        const { clock } = setupBuilder.build()
        clock.tick(BLUR_PERIOD_LENGTH)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH)
        closeForegroundPeriod()
        clock.tick(BLUR_PERIOD_LENGTH)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH)
        closeForegroundPeriod()
        clock.tick(BLUR_PERIOD_LENGTH)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH)
      })

      it('isInForegroundAt should match the focused/burred period', () => {
        // first blurred period
        expect(isInForegroundAt(2 as RelativeTime)).toEqual(false)

        // first focused period
        expect(isInForegroundAt(10 as RelativeTime)).toEqual(true)

        // second blurred period
        expect(isInForegroundAt(17 as RelativeTime)).toEqual(false)

        // second focused period
        expect(isInForegroundAt(25 as RelativeTime)).toEqual(true)

        // third blurred period
        expect(isInForegroundAt(32 as RelativeTime)).toEqual(false)

        // current focused periods
        expect(isInForegroundAt(42 as RelativeTime)).toEqual(true)
      })

      describe('selectInForegroundPeriodsFor', () => {
        it('should have 3 in foreground periods for the whole period', () => {
          const periods = selectInForegroundPeriodsFor(0 as RelativeTime, 50 as Duration)

          expect(periods).toHaveSize(3)
          expect(periods[0]).toEqual({
            start: (5 * 1e6) as ServerDuration,
            duration: (10 * 1e6) as ServerDuration,
          })
          expect(periods[1]).toEqual({
            start: (20 * 1e6) as ServerDuration,
            duration: (10 * 1e6) as ServerDuration,
          })
          expect(periods[2]).toEqual({
            start: (35 * 1e6) as ServerDuration,
            duration: (15 * 1e6) as ServerDuration,
          })
        })

        it('should have 2 in foreground periods when in between the two full periods', () => {
          const periods = selectInForegroundPeriodsFor(10 as RelativeTime, 15 as Duration)

          expect(periods).toHaveSize(2)
          expect(periods[0]).toEqual({
            start: 0 as ServerDuration,
            duration: (5 * 1e6) as ServerDuration,
          })
          expect(periods[1]).toEqual({
            start: (10 * 1e6) as ServerDuration,
            duration: (5 * 1e6) as ServerDuration,
          })
        })

        it('should have 2 periods, when in between the the full period and ongoing periods', () => {
          const periods = selectInForegroundPeriodsFor(25 as RelativeTime, 20 as Duration)

          expect(periods).toHaveSize(2)
          expect(periods[0]).toEqual({
            start: 0 as ServerDuration,
            duration: (5 * 1e6) as ServerDuration,
          })
          expect(periods[1]).toEqual({
            start: (10 * 1e6) as ServerDuration,
            duration: (10 * 1e6) as ServerDuration,
          })
        })
      })
    })

    describe('with one missing blur event. with two closed focus period every 5 seconds lasting 10 seconds', () => {
      /*
      events         F       F       B
      periods        <------><------->
      time       0   5  10  15  20  25
      */
      beforeEach(() => {
        const { clock } = setupBuilder.build()
        clock.tick(BLUR_PERIOD_LENGTH)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH)
        closeForegroundPeriod()
        clock.tick(BLUR_PERIOD_LENGTH)
      })
      it('isInForegroundAt should match the focused/burred period', () => {
        expect(isInForegroundAt(2 as RelativeTime)).toEqual(false)
        expect(isInForegroundAt(10 as RelativeTime)).toEqual(true)
        expect(isInForegroundAt(20 as RelativeTime)).toEqual(true)
        expect(isInForegroundAt(30 as RelativeTime)).toEqual(false)
      })
    })

    it('should not be in foreground, when the periods is closed twice', () => {
      const { clock } = setupBuilder.build()
      addNewForegroundPeriod()
      clock.tick(BLUR_PERIOD_LENGTH)
      pageStateHistory.addPageState(PageState.PASSIVE)

      expect(isInForegroundAt(relativeNow())).toEqual(false)
    })

    it('after starting with a blur even, should not be in foreground', () => {
      pageStateHistory.addPageState(PageState.PASSIVE)

      expect(isInForegroundAt(relativeNow())).toEqual(false)
    })
  })

  describe('when the page has focus when starting', () => {
    beforeEach(() => {
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => true)
      pageStateHistory = startPageStateHistory(configuration)
    })

    describe('when there is no focus event', () => {
      it('should return true during the focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH)
        closeForegroundPeriod()

        expect(isInForegroundAt(2 as RelativeTime)).toEqual(true)
      })

      it('should return false after the first focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH)
        closeForegroundPeriod()

        expect(isInForegroundAt(12 as RelativeTime)).toEqual(false)
      })
    })

    describe('when still getting the first focus event and closing the first periods after 10 seconds', () => {
      it('should return true during the focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        closeForegroundPeriod()

        expect(isInForegroundAt(2 as RelativeTime)).toEqual(true)
      })

      it('should return false after the focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        closeForegroundPeriod()

        expect(isInForegroundAt(12 as RelativeTime)).toEqual(false)
      })
    })
  })
})
