import { RelativeTime, relativeNow, ServerDuration, toServerDuration, Duration } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { createNewEvent } from '../../../core/test/specHelper'
import { InForegroundPeriod } from '../rawRumEvent.types'
import { startForegroundContexts, ForegroundContexts } from './foregroundContexts'

const FIVE_SECONDS_MS = 5_000 as Duration
const TEN_SECONDS_MS = 10_000 as Duration

describe('foreground', () => {
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
    describe('without any focus not blur event', () => {
      describe('getInForeground', () => {
        it('should false', () => {
          const { clock } = setupBuilder.build()

          clock.tick(1_000)

          expect(foregroundContext.getInForeground(relativeNow())).toEqual({ view: { in_foreground: false } })
        })
      })

      describe('getInForegroundPeriods', () => {
        it('should an empty array', () => {
          const { clock } = setupBuilder.build()

          clock.tick(1_000)

          expect(foregroundContext.getInForegroundPeriods(relativeNow(), 0 as ServerDuration)).toEqual([])
        })
      })
    })

    describe('with two closed focus period & one active every 5 seconds lasting 10 seconds', () => {
      /* 
      events         F      B   F       B   F
      periods        <------>   <------->   <---- - - -
      time       0   5  10  15  20  25  30  35  40  45
      */
      beforeEach(() => {
        const { clock } = setupBuilder.build()
        clock.tick(FIVE_SECONDS_MS)
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(TEN_SECONDS_MS)
        window.dispatchEvent(createNewEvent('blur'))
        clock.tick(FIVE_SECONDS_MS)
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(TEN_SECONDS_MS)
        window.dispatchEvent(createNewEvent('blur'))
        clock.tick(FIVE_SECONDS_MS)
        window.dispatchEvent(createNewEvent('focus'))
        clock.tick(TEN_SECONDS_MS)
      })

      describe('getInForeground', () => {
        describe('after 2 second', () => {
          it('should false', () => {
            expect(foregroundContext.getInForeground(2_000 as RelativeTime)).toEqual({ view: { in_foreground: false } })
          })
        })

        describe('after 10 second', () => {
          it('should true', () => {
            expect(foregroundContext.getInForeground(10_000 as RelativeTime)).toEqual({ view: { in_foreground: true } })
          })
        })

        describe('after 17 second', () => {
          it('should false', () => {
            expect(foregroundContext.getInForeground(17_000 as RelativeTime)).toEqual({
              view: { in_foreground: false },
            })
          })
        })

        describe('after 25 seconds', () => {
          it('should true', () => {
            expect(foregroundContext.getInForeground(25_000 as RelativeTime)).toEqual({ view: { in_foreground: true } })
          })
        })

        describe('after 32 seconds', () => {
          it('should false', () => {
            expect(foregroundContext.getInForeground(32_000 as RelativeTime)).toEqual({
              view: { in_foreground: false },
            })
          })
        })

        describe('after all the events', () => {
          it('should true', () => {
            expect(foregroundContext.getInForeground(relativeNow())).toEqual({ view: { in_foreground: true } })
          })
        })
      })

      describe('getInForegroundPeriods', () => {
        describe('for the whole period', () => {
          let periods: InForegroundPeriod[] | undefined
          beforeEach(() => {
            periods = foregroundContext.getInForegroundPeriods(0 as RelativeTime, toServerDuration(50_000 as Duration))
          })
          it('should have 3 in foreground periods', () => {
            expect(periods).toHaveSize(3)
          })

          it('should have the whole first period', () => {
            expect(periods![0]).toEqual({
              start: toServerDuration(FIVE_SECONDS_MS),
              duration: toServerDuration(TEN_SECONDS_MS),
            })
          })

          it('should have the whole second period', () => {
            expect(periods![1]).toEqual({
              start: toServerDuration(20_000 as Duration),
              duration: toServerDuration(TEN_SECONDS_MS),
            })
          })

          it('should have the thrid period finishing with the view end', () => {
            expect(periods![2]).toEqual({
              start: toServerDuration(35_000 as Duration),
              duration: toServerDuration(15_000 as Duration),
            })
          })
        })

        describe('when in between the two full periods', () => {
          let periods: InForegroundPeriod[] | undefined
          beforeEach(() => {
            periods = foregroundContext.getInForegroundPeriods(
              10_000 as RelativeTime,
              toServerDuration(15_000 as Duration)
            )
          })
          it('should have 2 in foreground periods', () => {
            expect(periods).toHaveSize(2)
          })

          it('should have the first period with the beginning truncated', () => {
            expect(periods![0]).toEqual({
              start: toServerDuration(0 as Duration),
              duration: toServerDuration(5_000 as Duration),
            })
          })

          it('should have the second period with the end truncated', () => {
            expect(periods![1]).toEqual({
              start: toServerDuration(10_000 as Duration),
              duration: toServerDuration(5_000 as Duration),
            })
          })
        })
      })
    })
  })

  describe('when the page has focus when starting', () => {
    beforeEach(() => {
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => true)
    })

    describe('when missing the first focus event and closing the first periods after 10 seconds', () => {
      describe('getInForeground after 2 seconds', () => {
        it('should true', () => {
          const { clock } = setupBuilder.build()
          clock.tick(TEN_SECONDS_MS)
          window.dispatchEvent(createNewEvent('blur'))

          expect(foregroundContext.getInForeground(2_000 as RelativeTime)).toEqual({ view: { in_foreground: true } })
        })
      })

      describe('getInForeground after 12 seconds', () => {
        it('should false', () => {
          const { clock } = setupBuilder.build()
          clock.tick(TEN_SECONDS_MS)
          window.dispatchEvent(createNewEvent('blur'))

          expect(foregroundContext.getInForeground(12_000 as RelativeTime)).toEqual({ view: { in_foreground: false } })
        })
      })
    })
  })
})
