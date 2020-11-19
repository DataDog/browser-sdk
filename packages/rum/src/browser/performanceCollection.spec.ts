import { setup, TestSetupBuilder } from '../../test/specHelper'
import { retrieveInitialDocumentResourceTiming, startPerformanceCollection } from './performanceCollection'

describe('rum initial document resource', () => {
  let setupBuilder: TestSetupBuilder
  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle, configuration }) => {
      startPerformanceCollection(lifeCycle, configuration)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('creates a resource timing for the initial document', (done) => {
    retrieveInitialDocumentResourceTiming((timing) => {
      expect(timing.entryType).toBe('resource')
      expect(timing.duration).toBeGreaterThan(0)
      done()
    })
  })
})
