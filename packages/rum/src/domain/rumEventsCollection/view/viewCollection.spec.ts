import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumEventCategory } from '../../../types'
import { LifeCycleEventType } from '../../lifeCycle'
import { View, ViewLoadingType } from './trackViews'
import { startViewCollection } from './viewCollection'

describe('viewCollection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup().beforeBuild((lifeCycle, configuration) => {
      configuration.isEnabled = () => false
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
      id: 'xxx',
      loadingTime: 20,
      loadingType: ViewLoadingType.INITIAL_LOAD,
      location: {},
      measures: {
        domComplete: 10,
        domContentLoaded: 10,
        domInteractive: 10,
        errorCount: 10,
        firstContentfulPaint: 10,
        loadEventEnd: 10,
        longTaskCount: 10,
        resourceCount: 10,
        userActionCount: 10,
      },
      referrer: '',
      startTime: 1234,
    }
    lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, view as View)

    expect(rawRumEvents[0].startTime).toBe(1234)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
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
