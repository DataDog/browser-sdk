import { ServerDuration, RelativeTime, Context, Configuration } from '@datadog/browser-core'
import { RumEvent } from '@datadog/browser-rum-core'
import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType } from '../../../rawRumEvent.types'

import { LifeCycleEventType, LifeCycle } from '../../lifeCycle'
import { trackViews, ViewEvent, THROTTLE_VIEW_UPDATE_PERIOD } from './trackViews'

function spyOnViews() {
  const handler = jasmine.createSpy()

  function getViewEvent(index: number) {
    return handler.calls.argsFor(index)[0] as ViewEvent
  }

  function getHandledCount() {
    return handler.calls.count()
  }

  return { handler, getViewEvent, getHandledCount }
}
const configuration: Partial<Configuration> = { isEnabled: () => true }
describe('the user focus the document when opening the view', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => ViewEvent
  let clock: jasmine.Clock
  let lifeCycle: LifeCycle

  beforeEach(() => {
    spyOn(Document.prototype, 'hasFocus').and.callFake(() => true)
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeClock()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        const result = trackViews(location, lifeCycle, configuration as Configuration)
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
      { start: 0 as RelativeTime, duration: 0 as ServerDuration, currently_focused: true },
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
        expect(getViewEvent(1).inForegroundPeriods).toEqual([
          { start: 0 as RelativeTime, duration: 10_000_000_000 as ServerDuration },
        ])
      })
    })

    describe('when a error is dispatched', () => {
      beforeEach(() => {
        lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ERROR } as RumEvent & Context)
        clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)
      })

      it('should update the duration of the currently focused time', () => {
        expect(getViewEvent(1).inForegroundPeriods).toEqual([
          { start: 0 as RelativeTime, duration: 13_000_000_000 as ServerDuration, currently_focused: true },
        ])
      })
    })

    describe('when the blur event is trigger from the document', () => {
      beforeEach(() => {
        document.dispatchEvent(new Event('blur'))
      })

      it('should keep view as focused when started', () => {
        expect(getViewEvent(1).inForeground).toBe(true)
      })

      it('should close a first focused time', () => {
        expect(getViewEvent(1).inForegroundPeriods).toEqual([
          { start: 0 as RelativeTime, duration: 10_000_000_000 as ServerDuration },
        ])
      })

      describe('after 5 second', () => {
        beforeEach(() => {
          clock.tick(5_000)
        })
        describe('when the focus event is trigger from the document', () => {
          beforeEach(() => {
            document.dispatchEvent(new Event('focus'))
          })

          it('should open a second focused time', () => {
            expect(getViewEvent(2).inForegroundPeriods).toEqual([
              { start: 0 as RelativeTime, duration: 10_000_000_000 as ServerDuration },
              { start: 15_000_000_000 as RelativeTime, duration: 0 as ServerDuration, currently_focused: true },
            ])
          })
        })
      })
    })
  })
})

describe('the user doest not focus the document when opening the view', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => ViewEvent

  beforeEach(() => {
    spyOn(Document.prototype, 'hasFocus').and.callFake(() => false)
    ;({ handler, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle, configuration as Configuration)
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
