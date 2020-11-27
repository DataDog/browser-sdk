import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventCategory } from '../../../types'
import { RumEventType } from '../../../typesV2'
import { LifeCycleEventType } from '../../lifeCycle'
import { View, ViewLoadingType } from './trackViews'
import { startViewCollection } from './viewCollection'

describe('viewCollection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => false,
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
    const view = {
      documentVersion: 3,
      duration: 100,
      eventCounts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
        userActionCount: 10,
      },
      id: 'xxx',
      loadingTime: 20,
      loadingType: ViewLoadingType.INITIAL_LOAD,
      location: {},
      referrer: '',
      startTime: 1234,
      timings: {
        domComplete: 10,
        domContentLoaded: 10,
        domInteractive: 10,
        firstContentfulPaint: 10,
        largestContentfulPaint: 10,
        loadEventEnd: 10,
      },
    }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view as View)

    expect(rawRumEvents[rawRumEvents.length - 1].startTime).toBe(1234)
    expect(rawRumEvents[rawRumEvents.length - 1].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      duration: 100 * 1e6,
      evt: {
        category: RumEventCategory.VIEW,
      },
      rum: {
        documentVersion: 3,
      },
      view: {
        loadingTime: 20 * 1e6,
        loadingType: ViewLoadingType.INITIAL_LOAD,
        measures: {
          domComplete: 10 * 1e6,
          domContentLoaded: 10 * 1e6,
          domInteractive: 10 * 1e6,
          errorCount: 10,
          firstContentfulPaint: 10 * 1e6,
          loadEventEnd: 10 * 1e6,
          longTaskCount: 10,
          resourceCount: 10,
          userActionCount: 10,
        },
      },
    })
  })
})

describe('viewCollection V2', () => {
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
    const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
    const view = {
      cumulativeLayoutShift: 1,
      documentVersion: 3,
      duration: 100,
      eventCounts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
        userActionCount: 10,
      },
      id: 'xxx',
      loadingTime: 20,
      loadingType: ViewLoadingType.INITIAL_LOAD,
      location: {},
      referrer: '',
      startTime: 1234,
      timings: {
        domComplete: 10,
        domContentLoaded: 10,
        domInteractive: 10,
        firstContentfulPaint: 10,
        firstInputDelay: 12,
        largestContentfulPaint: 10,
        loadEventEnd: 10,
      },
    }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view as View)

    expect(rawRumEventsV2[rawRumEventsV2.length - 1].startTime).toBe(1234)
    expect(rawRumEventsV2[rawRumEventsV2.length - 1].rawRumEvent).toEqual({
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
        domComplete: 10 * 1e6,
        domContentLoaded: 10 * 1e6,
        domInteractive: 10 * 1e6,
        error: {
          count: 10,
        },
        firstContentfulPaint: 10 * 1e6,
        firstInputDelay: 12 * 1e6,
        largestContentfulPaint: 10 * 1e6,
        loadEventEnd: 10 * 1e6,
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
