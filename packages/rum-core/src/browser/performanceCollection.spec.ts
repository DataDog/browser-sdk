import type { TestSetupBuilder } from '../../test'
import { setup } from '../../test'
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

      // generate a performance entry like structure
      const toJsonTiming = timing.toJSON()
      expect(toJsonTiming.entryType).toEqual(timing.entryType)
      expect(toJsonTiming.duration).toEqual(timing.duration)
      expect((toJsonTiming as any).toJSON).toBeUndefined()
      done()
    })
  })
})
