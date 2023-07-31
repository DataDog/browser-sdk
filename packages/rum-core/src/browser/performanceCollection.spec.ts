import type { TestSetupBuilder } from '../../test'
import { setup } from '../../test'
import type { RumConfiguration } from '../domain/configuration'
import { retrieveInitialDocumentResourceTiming, startPerformanceCollection } from './performanceCollection'

describe('rum initial document resource', () => {
  let setupBuilder: TestSetupBuilder
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    setupBuilder = setup().beforeBuild(({ lifeCycle, configuration }) => {
      startPerformanceCollection(lifeCycle, configuration)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('creates a resource timing for the initial document', (done) => {
    retrieveInitialDocumentResourceTiming(configuration, (timing) => {
      expect(timing.entryType).toBe('resource')
      expect(timing.duration).toBeGreaterThan(0)
      done()
    })
  })
})
