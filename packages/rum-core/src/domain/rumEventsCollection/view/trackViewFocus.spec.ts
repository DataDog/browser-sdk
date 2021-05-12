import { Duration, Context } from '@datadog/browser-core'
import { RumEvent } from '@datadog/browser-rum-core'
import { setup, TestSetupBuilder, spyOnViews } from '../../../../test/specHelper'
import { RumEventType } from '../../../rawRumEvent.types'

import { Clock, createNewEvent } from '../../../../../core/test/specHelper'
import { LifeCycleEventType, LifeCycle } from '../../lifeCycle'
import { trackViews, ViewEvent, THROTTLE_VIEW_UPDATE_PERIOD } from './trackViews'

describe('the document is focused when opening the view', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => ViewEvent
  let clock: Clock
  let lifeCycle: LifeCycle

  beforeEach(() => {
    spyOn(Document.prototype, 'hasFocus').and.callFake(() => true)
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeClock()
      .withConfiguration({ isEnabled: () => true })
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle, configuration }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        const result = trackViews(location, lifeCycle, configuration)
        return result
      })
    ;({ clock, lifeCycle } = setupBuilder.build())
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should set view as focused when started', () => {
    expect(getViewEvent(0).inForeground).toBe(true)
  })

  it('should create a first focused time', () => {
    expect(getViewEvent(0).inForegroundPeriods).toEqual([
      { start: 0 as Duration, duration: 0 as Duration, currentlyFocused: true },
    ])
  })

  describe('after 10 second', () => {
    beforeEach(() => {
      clock.tick(10_000)
    })

    describe('when the view changes', () => {
      beforeEach(() => {
        history.pushState({}, '', '/bar')
      })

      it('should update the duration of the currently focused time and close it', () => {
        expect(getViewEvent(1).inForegroundPeriods).toEqual([{ start: 0 as Duration, duration: 10_000 as Duration }])
      })
    })

    describe('when a error is dispatched', () => {
      beforeEach(() => {
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ERROR } as RumEvent & Context)
        clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)
      })

      it('should update the duration of the currently focused time', () => {
        expect(getViewEvent(1).inForegroundPeriods).toEqual([
          { start: 0 as Duration, duration: 13_000 as Duration, currentlyFocused: true },
        ])
      })
    })

    describe('when the blur event is trigger from the window', () => {
      beforeEach(() => {
        window.dispatchEvent(createNewEvent('blur'))
      })

      it('should keep view as focused when started', () => {
        expect(getViewEvent(1).inForeground).toBe(true)
      })

      it('should close a first focused time', () => {
        expect(getViewEvent(1).inForegroundPeriods).toEqual([{ start: 0 as Duration, duration: 10_000 as Duration }])
      })

      describe('after 5 second', () => {
        beforeEach(() => {
          clock.tick(5_000)
        })
        describe('when the focus event is trigger from the window', () => {
          beforeEach(() => {
            window.dispatchEvent(createNewEvent('focus'))
          })

          it('should open a second focused time', () => {
            expect(getViewEvent(2).inForegroundPeriods).toEqual([
              { start: 0 as Duration, duration: 10_000 as Duration },
              { start: 15_000 as Duration, duration: 0 as Duration, currentlyFocused: true },
            ])
          })
        })
      })
    })
  })
})

describe('the user doest not focus the window when opening the view', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => ViewEvent

  beforeEach(() => {
    spyOn(Document.prototype, 'hasFocus').and.callFake(() => false)
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .withConfiguration({ isEnabled: () => true })
      .beforeBuild(({ location, lifeCycle, configuration }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle, configuration)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should set initial view as not focused', () => {
    setupBuilder.build()
    expect(getViewEvent(0).inForeground).toBe(false)
  })
})
