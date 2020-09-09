import { isIE } from '@datadog/browser-core'

import { restorePageVisibility, setPageVisibility } from '../../core/src/specHelper'
import { retrieveInitialDocumentResourceTimingWhenDomReady } from '../../rum/src/performanceCollection'
import { setup, TestSetupBuilder } from './specHelper'

describe('rum first_contentful_paint', () => {
  let setupBuilder: TestSetupBuilder
  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }

    setupBuilder = setup()
      .withPerformanceObserverStubBuilder()
      .withPerformanceCollection()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
  })

  it('should not be collected when page starts not visible', () => {
    setPageVisibility('hidden')
    const { stubBuilder } = setupBuilder.build()

    expect(stubBuilder.getEntryTypes()).not.toContain('paint')
  })

  it('should be collected when page starts visible', () => {
    setPageVisibility('visible')
    const { stubBuilder } = setupBuilder.build()

    expect(stubBuilder.getEntryTypes()).toContain('paint')
  })
})

describe('rum initial document resource', () => {
  let setupBuilder: TestSetupBuilder
  beforeEach(() => {
    setupBuilder = setup().withPerformanceCollection()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('creates a resource timing for the initial document', (done) => {
    retrieveInitialDocumentResourceTimingWhenDomReady((timing) => {
      expect(timing.entryType).toBe('resource')
      expect(timing.duration).toBeGreaterThan(0)
      done()
    })
  })
})
