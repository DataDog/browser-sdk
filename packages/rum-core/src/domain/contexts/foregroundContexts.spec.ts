import type { RelativeTime, Duration, ServerDuration } from '@datadog/browser-core'
import { relativeNow } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../test/specHelper'
import { setup } from '../../../test/specHelper'
import type { ForegroundContexts } from './foregroundContexts'
import {
  startForegroundContexts,
  MAX_NUMBER_OF_SELECTABLE_FOREGROUND_PERIODS,
  MAX_NUMBER_OF_STORED_FOREGROUND_PERIODS,
  closeForegroundPeriod,
  addNewForegroundPeriod,
} from './foregroundContexts'

const FOCUS_PERIOD_LENGTH = 10 as Duration
const BLUR_PERIOD_LENGTH = 5 as Duration

describe('foreground context', () => {
  let foregroundContext: ForegroundContexts
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(() => {
        foregroundContext = startForegroundContexts()
        return foregroundContext
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('when the page do not have the focus when starting', () => {
    beforeEach(() => {
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => false)
    })
    describe('without any focus nor blur event', () => {
      describe('isInForegroundAt', () => {
        it('should return false', () => {
          const { clock } = setupBuilder.build()

          clock.tick(1_000)

          expect(foregroundContext.isInForegroundAt(relativeNow())).toEqual(false)
        })
      })

      describe('selectInForegroundPeriodsFor', () => {
        it('should an empty array', () => {
          const { clock } = setupBuilder.build()

          clock.tick(1_000)

          expect(foregroundContext.selectInForegroundPeriodsFor(relativeNow(), 0 as Duration)).toEqual([])
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
        expect(foregroundContext.isInForegroundAt(2 as RelativeTime)).toEqual(false)

        // first focused period
        expect(foregroundContext.isInForegroundAt(10 as RelativeTime)).toEqual(true)

        // second blurred period
        expect(foregroundContext.isInForegroundAt(17 as RelativeTime)).toEqual(false)

        // second focused period
        expect(foregroundContext.isInForegroundAt(25 as RelativeTime)).toEqual(true)

        // third blurred period
        expect(foregroundContext.isInForegroundAt(32 as RelativeTime)).toEqual(false)

        // current focused periods
        expect(foregroundContext.isInForegroundAt(42 as RelativeTime)).toEqual(true)
      })

      describe('selectInForegroundPeriodsFor', () => {
        it('should have 3 in foreground periods for the whole period', () => {
          const periods = foregroundContext.selectInForegroundPeriodsFor(0 as RelativeTime, 50 as Duration)

          expect(periods).toHaveSize(3)
          expect(periods![0]).toEqual({
            start: (5 * 1e6) as ServerDuration,
            duration: (10 * 1e6) as ServerDuration,
          })
          expect(periods![1]).toEqual({
            start: (20 * 1e6) as ServerDuration,
            duration: (10 * 1e6) as ServerDuration,
          })
          expect(periods![2]).toEqual({
            start: (35 * 1e6) as ServerDuration,
            duration: (15 * 1e6) as ServerDuration,
          })
        })

        it('should have 2 in foreground periods when in between the two full periods', () => {
          const periods = foregroundContext.selectInForegroundPeriodsFor(10 as RelativeTime, 15 as Duration)

          expect(periods).toHaveSize(2)
          expect(periods![0]).toEqual({
            start: 0 as ServerDuration,
            duration: (5 * 1e6) as ServerDuration,
          })
          expect(periods![1]).toEqual({
            start: (10 * 1e6) as ServerDuration,
            duration: (5 * 1e6) as ServerDuration,
          })
        })

        it('should have 2 periods, when in between the the full period and ongoing periods', () => {
          const periods = foregroundContext.selectInForegroundPeriodsFor(25 as RelativeTime, 20 as Duration)

          expect(periods).toHaveSize(2)
          expect(periods![0]).toEqual({
            start: 0 as ServerDuration,
            duration: (5 * 1e6) as ServerDuration,
          })
          expect(periods![1]).toEqual({
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
        expect(foregroundContext.isInForegroundAt(2 as RelativeTime)).toEqual(false)
        expect(foregroundContext.isInForegroundAt(10 as RelativeTime)).toEqual(true)
        expect(foregroundContext.isInForegroundAt(20 as RelativeTime)).toEqual(true)
        expect(foregroundContext.isInForegroundAt(30 as RelativeTime)).toEqual(false)
      })
    })

    it('should not record anything after reaching the maximum number of focus periods', () => {
      const { clock } = setupBuilder.build()
      const start = relativeNow()
      for (let i = 0; i < MAX_NUMBER_OF_STORED_FOREGROUND_PERIODS + 1; i++) {
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH)
        closeForegroundPeriod()
        clock.tick(BLUR_PERIOD_LENGTH)
      }

      addNewForegroundPeriod()
      clock.tick(FOCUS_PERIOD_LENGTH)

      expect(foregroundContext.isInForegroundAt(relativeNow())).toEqual(false)
      const duration = (((FOCUS_PERIOD_LENGTH as number) + (BLUR_PERIOD_LENGTH as number)) *
        MAX_NUMBER_OF_STORED_FOREGROUND_PERIODS) as Duration
      expect(foregroundContext.selectInForegroundPeriodsFor(start, duration)).toHaveSize(
        MAX_NUMBER_OF_SELECTABLE_FOREGROUND_PERIODS
      )
    })

    it('should not be in foreground, when the periods is closed twice', () => {
      const { clock } = setupBuilder.build()
      addNewForegroundPeriod()
      clock.tick(FOCUS_PERIOD_LENGTH)
      closeForegroundPeriod()
      clock.tick(BLUR_PERIOD_LENGTH)
      closeForegroundPeriod()

      expect(foregroundContext.isInForegroundAt(relativeNow())).toEqual(false)
    })

    it('after starting with a blur even, should not be in foreground', () => {
      setupBuilder.build()
      closeForegroundPeriod()

      expect(foregroundContext.isInForegroundAt(relativeNow())).toEqual(false)
    })
  })

  describe('when the page has focus when starting', () => {
    beforeEach(() => {
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => true)
    })

    describe('when there is no focus event', () => {
      it('should return true during the focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH)
        closeForegroundPeriod()

        expect(foregroundContext.isInForegroundAt(2 as RelativeTime)).toEqual(true)
      })

      it('should return false after the first focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH)
        closeForegroundPeriod()

        expect(foregroundContext.isInForegroundAt(12 as RelativeTime)).toEqual(false)
      })
    })

    describe('when still getting the first focus event and closing the first periods after 10 seconds', () => {
      it('should return true during the focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        closeForegroundPeriod()

        expect(foregroundContext.isInForegroundAt(2 as RelativeTime)).toEqual(true)
      })

      it('should return false after the focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        addNewForegroundPeriod()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        closeForegroundPeriod()

        expect(foregroundContext.isInForegroundAt(12 as RelativeTime)).toEqual(false)
      })
    })
  })
})
