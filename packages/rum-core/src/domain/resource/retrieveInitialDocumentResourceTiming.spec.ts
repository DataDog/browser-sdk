import { mockDocumentReadyState, mockRumConfiguration } from '../../../test'
import { FAKE_INITIAL_DOCUMENT } from './resourceUtils'
import { retrieveInitialDocumentResourceTiming } from './retrieveInitialDocumentResourceTiming'

describe('rum initial document resource', () => {
  it('creates a resource timing for the initial document', (done) => {
    retrieveInitialDocumentResourceTiming(mockRumConfiguration(), (timing) => {
      expect(timing.entryType).toBe('resource')
      expect(timing.initiatorType).toBe(FAKE_INITIAL_DOCUMENT)
      expect(timing.duration).toBeGreaterThan(0)

      // generate a performance entry like structure
      const toJsonTiming = timing.toJSON()
      expect(toJsonTiming.entryType).toEqual(timing.entryType)
      expect(toJsonTiming.duration).toEqual(timing.duration)
      expect((toJsonTiming as any).toJSON).toBeUndefined()
      done()
    })
  })

  it('waits until the document is interactive to notify the resource', () => {
    const { triggerOnDomLoaded } = mockDocumentReadyState()
    const spy = jasmine.createSpy()
    retrieveInitialDocumentResourceTiming(mockRumConfiguration(), spy)
    expect(spy).not.toHaveBeenCalled()
    triggerOnDomLoaded()
    expect(spy).toHaveBeenCalled()
  })
})
