import { RelativeTime, relativeNow, Duration, ServerDuration } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { createNewEvent } from '../../../core/test/specHelper'
import { startForegroundContexts, ForegroundContexts, MAX_NUMBER_OF_FOCUSED_TIME } from './foregroundContexts'

const FOCUS_PERIOD_LENGTH = 10 as Duration
const BLUR_PERIOD_LENGTH = 5 as Duration

describe('foreground context', () => {
  let foregroundContext: ForegroundContexts
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeClock()
      .withConfiguration({ isEnabled: () => true })
      .beforeBuild(({ configuration }) => {
        foregroundContext = startForegroundContexts(configuration)
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
      describe('getInForeground', () => {
        it('should return false', () => {
          const { clock } = setupBuilder.build()

          clock.tick(1_000)

          expect(foregroundContext.getInForeground(relativeNow())).toEqual(false)
        })
      })

      describe('getInForegroundPeriods', () => {
        it('should an empty array', () => {
          const { clock } = setupBuilder.build()

          clock.tick(1_000)

          expect(foregroundContext.getInForegroundPeriods(relativeNow(), 0 as Duration)).toEqual([])
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
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH)
        window.dispatchEvent(createNewEvent('blur'))
        clock.tick(BLUR_PERIOD_LENGTH)
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH)
        window.dispatchEvent(createNewEvent('blur'))
        clock.tick(BLUR_PERIOD_LENGTH)
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH)
      })

      it('getInForeground should match the focused/burred period', () => {
        // first blurred period
        expect(foregroundContext.getInForeground(2 as RelativeTime)).toEqual(false)

        // first focused period
        expect(foregroundContext.getInForeground(10 as RelativeTime)).toEqual(true)

        // second blurred period
        expect(foregroundContext.getInForeground(17 as RelativeTime)).toEqual(false)

        // second focused period
        expect(foregroundContext.getInForeground(25 as RelativeTime)).toEqual(true)

        // third blurred period
        expect(foregroundContext.getInForeground(32 as RelativeTime)).toEqual(false)

        // current focused periods
        expect(foregroundContext.getInForeground(42 as RelativeTime)).toEqual(true)
      })

      describe('getInForegroundPeriods', () => {
        it('should have 3 in foreground periods for the whole period', () => {
          const periods = foregroundContext.getInForegroundPeriods(0 as RelativeTime, 50 as Duration)

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
          const periods = foregroundContext.getInForegroundPeriods(10 as RelativeTime, 15 as Duration)

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
          const periods = foregroundContext.getInForegroundPeriods(25 as RelativeTime, 20 as Duration)

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
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH)
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH)
        window.dispatchEvent(createNewEvent('blur'))
        clock.tick(BLUR_PERIOD_LENGTH)
      })
      it('getInForeground should match the focused/burred period', () => {
        expect(foregroundContext.getInForeground(2 as RelativeTime)).toEqual(false)
        expect(foregroundContext.getInForeground(10 as RelativeTime)).toEqual(true)
        expect(foregroundContext.getInForeground(20 as RelativeTime)).toEqual(true)
        expect(foregroundContext.getInForeground(30 as RelativeTime)).toEqual(false)
      })
    })

    it('should not record anything after reaching the maximum number of focus periods', () => {
      const { clock } = setupBuilder.build()
      for (let i = 0; i < MAX_NUMBER_OF_FOCUSED_TIME + 1; i++) {
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH)
        window.dispatchEvent(createNewEvent('blur'))
        clock.tick(BLUR_PERIOD_LENGTH)
      }

      window.dispatchEvent(createNewEvent('focus'))
      clock.tick(FOCUS_PERIOD_LENGTH)

      expect(foregroundContext.getInForeground(relativeNow())).toEqual(false)
    })

    it('should not be in foreground, when the periods is closed twice', () => {
      const { clock } = setupBuilder.build()
      window.dispatchEvent(createNewEvent('focus'))
      clock.tick(FOCUS_PERIOD_LENGTH)
      window.dispatchEvent(createNewEvent('blur'))
      clock.tick(BLUR_PERIOD_LENGTH)
      window.dispatchEvent(createNewEvent('blur'))

      expect(foregroundContext.getInForeground(relativeNow())).toEqual(false)
    })

    it('after starting with a blur even, should not be in foreground', () => {
      setupBuilder.build()
      window.dispatchEvent(createNewEvent('blur'))

      expect(foregroundContext.getInForeground(relativeNow())).toEqual(false)
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
        window.dispatchEvent(createNewEvent('blur'))

        expect(foregroundContext.getInForeground(2 as RelativeTime)).toEqual(true)
      })

      it('should return false after the first focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH)
        window.dispatchEvent(createNewEvent('blur'))

        expect(foregroundContext.getInForeground(12 as RelativeTime)).toEqual(false)
      })
    })

    describe('when still getting the first focus event and closing the first periods after 10 seconds', () => {
      it('should return true during the focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        window.dispatchEvent(createNewEvent('blur'))

        expect(foregroundContext.getInForeground(2 as RelativeTime)).toEqual(true)
      })

      it('should return false after the focused period', () => {
        const { clock } = setupBuilder.build()
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH / 2)
        window.dispatchEvent(createNewEvent('blur'))

        expect(foregroundContext.getInForeground(12 as RelativeTime)).toEqual(false)
      })
    })
  })
})
