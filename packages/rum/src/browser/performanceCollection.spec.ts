import { isIE, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'

import { setup, TestSetupBuilder } from '../../test/specHelper'
import { retrieveInitialDocumentResourceTiming, startPerformanceCollection } from './performanceCollection'

describe('rum first_contentful_paint', () => {
  let setupBuilder: TestSetupBuilder
  let performanceObserverObserveSpy: jasmine.Spy<(options?: PerformanceObserverInit | undefined) => void>

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }

    performanceObserverObserveSpy = spyOn(PerformanceObserver.prototype, 'observe')
    setupBuilder = setup().beforeBuild(({ lifeCycle, configuration }) => {
      startPerformanceCollection(lifeCycle, configuration)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
  })

  it('should not be collected when page starts not visible', () => {
    setPageVisibility('hidden')
    setupBuilder.build()

    expect(performanceObserverObserveSpy.calls.argsFor(0)[0]!.entryTypes).not.toContain('paint')
  })

  it('should be collected when page starts visible', () => {
    setPageVisibility('visible')
    setupBuilder.build()

    expect(performanceObserverObserveSpy.calls.argsFor(0)[0]!.entryTypes).toContain('paint')
  })
})

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
