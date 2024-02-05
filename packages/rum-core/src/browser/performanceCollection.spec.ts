import { setup } from '../../test'
import type { RumConfiguration } from '../domain/configuration'
import { retrieveInitialDocumentResourceTiming, startPerformanceCollection } from './performanceCollection'

describe('rum initial document resource', () => {
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    setup().beforeBuild(({ lifeCycle, configuration }) => {
      startPerformanceCollection(lifeCycle, configuration)
    })
  })

  it('creates a resource timing for the initial document', (done) => {
    retrieveInitialDocumentResourceTiming(configuration, (timing) => {
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
