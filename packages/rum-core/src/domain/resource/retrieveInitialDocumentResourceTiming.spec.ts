import type { RumConfiguration } from '../configuration'
import { retrieveInitialDocumentResourceTiming } from './retrieveInitialDocumentResourceTiming'

describe('rum initial document resource', () => {
  it('creates a resource timing for the initial document', (done) => {
    retrieveInitialDocumentResourceTiming({} as RumConfiguration, (timing) => {
      expect(timing.entryType).toBe('resource')
      expect(timing.duration).toBeGreaterThan(0)

      // generate a performance entry like structure
      const toJsonTiming = timing.toJSON()
      expect(toJsonTiming.entryType).toEqual(timing.entryType)
      expect(toJsonTiming.duration).toEqual(timing.duration)
      done()
    })
  })
})
