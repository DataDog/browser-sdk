import { RelativeTime, relativeNow, toServerDuration, Duration } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { createNewEvent } from '../../../core/test/specHelper'
import { InForegroundPeriod } from '../rawRumEvent.types'
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

      describe('getInForeground', () => {
        it('should return false in the first blurred period', () => {
          expect(foregroundContext.getInForeground(2 as RelativeTime)).toEqual(false)
        })

        it('should return true in the first focused period', () => {
          expect(foregroundContext.getInForeground(10 as RelativeTime)).toEqual(true)
        })

        it('should return false in the second blurred period', () => {
          expect(foregroundContext.getInForeground(17 as RelativeTime)).toEqual(false)
        })

        it('should return true in the second focused period', () => {
          expect(foregroundContext.getInForeground(25 as RelativeTime)).toEqual(true)
        })

        it('should return false in the third blurred period', () => {
          expect(foregroundContext.getInForeground(32 as RelativeTime)).toEqual(false)
        })

        it('after all the events, should return true because the last period was never closed', () => {
          expect(foregroundContext.getInForeground(42 as RelativeTime)).toEqual(true)
        })
      })

      describe('getInForegroundPeriods', () => {
        describe('for the whole period', () => {
          let periods: InForegroundPeriod[] | undefined
          beforeEach(() => {
            periods = foregroundContext.getInForegroundPeriods(0 as RelativeTime, 50 as Duration)
          })
          it('should have 3 in foreground periods', () => {
            expect(periods).toHaveSize(3)
          })

          it('should have the whole first period', () => {
            expect(periods![0]).toEqual({
              start: toServerDuration(5 as Duration),
              duration: toServerDuration(10 as Duration),
            })
          })

          it('should have the whole second period', () => {
            expect(periods![1]).toEqual({
              start: toServerDuration(20 as Duration),
              duration: toServerDuration(10 as Duration),
            })
          })

          it('should have the third period finishing with the view end', () => {
            expect(periods![2]).toEqual({
              start: toServerDuration(35 as Duration),
              duration: toServerDuration(15 as Duration),
            })
          })
        })

        describe('when in between the two full periods', () => {
          let periods: InForegroundPeriod[] | undefined
          beforeEach(() => {
            periods = foregroundContext.getInForegroundPeriods(10 as RelativeTime, 15 as Duration)
          })
          it('should have 2 in foreground periods', () => {
            expect(periods).toHaveSize(2)
          })

          it('should have the first period with the beginning truncated', () => {
            expect(periods![0]).toEqual({
              start: toServerDuration(0 as Duration),
              duration: toServerDuration(5 as Duration),
            })
          })

          it('should have the second period with the end truncated', () => {
            expect(periods![1]).toEqual({
              start: toServerDuration(10 as Duration),
              duration: toServerDuration(5 as Duration),
            })
          })
        })

        describe('when in between the the full period and ongoing periods', () => {
          let periods: InForegroundPeriod[] | undefined
          beforeEach(() => {
            periods = foregroundContext.getInForegroundPeriods(25 as RelativeTime, 20 as Duration)
          })
          it('should have 2 in foreground periods', () => {
            expect(periods).toHaveSize(2)
          })

          it('should have the first period with the beginning truncated', () => {
            expect(periods![0]).toEqual({
              start: toServerDuration(0 as Duration),
              duration: toServerDuration(5 as Duration),
            })
          })

          it('should have the second period with the end truncated with the view end', () => {
            expect(periods![1]).toEqual({
              start: toServerDuration(10 as Duration),
              duration: toServerDuration(10 as Duration),
            })
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

      describe('getInForeground', () => {
        it('should return false in the first blurred period', () => {
          expect(foregroundContext.getInForeground(2 as RelativeTime)).toEqual(false)
        })

        it('should return true in the first part of the first focused period', () => {
          expect(foregroundContext.getInForeground(10 as RelativeTime)).toEqual(true)
        })
        it('should return true in the second part of the first focused period', () => {
          expect(foregroundContext.getInForeground(20 as RelativeTime)).toEqual(true)
        })

        it('should return false after all', () => {
          expect(foregroundContext.getInForeground(30 as RelativeTime)).toEqual(false)
        })
      })
    })

    describe(`after reaching the maximum number of focus periods: ${MAX_NUMBER_OF_FOCUSED_TIME}`, () => {
      beforeEach(() => {
        // given
        const { clock } = setupBuilder.build()
        Array.from({ length: MAX_NUMBER_OF_FOCUSED_TIME + 1 }).forEach(() => {
          window.dispatchEvent(createNewEvent('focus'))
          clock.tick(FOCUS_PERIOD_LENGTH)
          window.dispatchEvent(createNewEvent('blur'))
          clock.tick(BLUR_PERIOD_LENGTH)
        })

        // when
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(FOCUS_PERIOD_LENGTH)
      })

      it('should not record anything after', () => {
        // then
        expect(foregroundContext.getInForeground(relativeNow())).toEqual(false)
      })
    })

    it('when the periods is closed twice, should not be in foreground', () => {
      // when
      const { clock } = setupBuilder.build()
      window.dispatchEvent(createNewEvent('focus'))
      clock.tick(FOCUS_PERIOD_LENGTH)
      window.dispatchEvent(createNewEvent('blur'))
      clock.tick(BLUR_PERIOD_LENGTH)
      window.dispatchEvent(createNewEvent('blur'))

      // then
      expect(foregroundContext.getInForeground(relativeNow())).toEqual(false)
    })

    it('after starting with a blur even, should not be in foreground', () => {
      // when
      setupBuilder.build()
      window.dispatchEvent(createNewEvent('blur'))
      // then
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
