import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { View, ViewLoadingType } from './trackViews'
import { startViewCollection } from './viewCollection'

describe('viewCollection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .beforeBuild(({ lifeCycle, configuration }) => {
        startViewCollection(lifeCycle, configuration, location)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create view from view update', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    const location: Partial<Location> = {}
    const view = {
      location,
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
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view as View)

    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234)
    expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent).toEqual({
      _dd: {
        documentVersion: 3,
      },
      date: jasmine.any(Number),
      type: RumEventType.VIEW,
      view: {
        action: {
          count: 10,
        },
        cumulativeLayoutShift: 1,
        customTimings: {
          bar: 20 * 1e6,
          foo: 10 * 1e6,
        },
        domComplete: 10 * 1e6,
        domContentLoaded: 10 * 1e6,
        domInteractive: 10 * 1e6,
        error: {
          count: 10,
        },
        firstContentfulPaint: 10 * 1e6,
        firstInputDelay: 12 * 1e6,
        firstInputTime: 10 * 1e6,
        isActive: false,
        largestContentfulPaint: 10 * 1e6,
        loadEvent: 10 * 1e6,
        loadingTime: 20 * 1e6,
        loadingType: ViewLoadingType.INITIAL_LOAD,
        longTask: {
          count: 10,
        },
        resource: {
          count: 10,
        },
        timeSpent: 100 * 1e6,
      },
    })
  })
})
