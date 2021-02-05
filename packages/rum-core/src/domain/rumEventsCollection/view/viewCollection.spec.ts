import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { ViewLoadingType } from './trackViews'
import { startViewCollection } from './viewCollection'

describe('viewCollection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .beforeBuild(({ lifeCycle }) => {
        startViewCollection(lifeCycle, location)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create view from view update', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const location: Partial<Location> = {}
    const view = {
      cumulativeLayoutShift: 1,
      customTimings: {
        bar: 20,
        foo: 10,
      },
      documentVersion: 3,
      duration: 100,
      eventCounts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
        userActionCount: 10,
      },
      id: 'xxx',
      isActive: false,
      loadingTime: 20,
      loadingType: ViewLoadingType.INITIAL_LOAD,
      location: location as Location,
      referrer: '',
      startTime: 1234,
      timings: {
        domComplete: 10,
        domContentLoaded: 10,
        domInteractive: 10,
        firstContentfulPaint: 10,
        firstInputDelay: 12,
        firstInputTime: 10,
        largestContentfulPaint: 10,
        loadEvent: 10,
      },
    }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view)

    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234)
    expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent).toEqual({
      _dd: {
        document_version: 3,
      },
      date: jasmine.any(Number),
      type: RumEventType.VIEW,
      view: {
        action: {
          count: 10,
        },
        cumulative_layout_shift: 1,
        custom_timings: {
          bar: 20 * 1e6,
          foo: 10 * 1e6,
        },
        dom_complete: 10 * 1e6,
        dom_content_loaded: 10 * 1e6,
        dom_interactive: 10 * 1e6,
        error: {
          count: 10,
        },
        first_contentful_paint: 10 * 1e6,
        first_input_delay: 12 * 1e6,
        first_input_time: 10 * 1e6,
        is_active: false,
        largest_contentful_paint: 10 * 1e6,
        load_event: 10 * 1e6,
        loading_time: 20 * 1e6,
        loading_type: ViewLoadingType.INITIAL_LOAD,
        long_task: {
          count: 10,
        },
        resource: {
          count: 10,
        },
        time_spent: 100 * 1e6,
      },
    })
  })
})
