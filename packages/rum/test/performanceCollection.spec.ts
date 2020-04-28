import { isIE, PerformanceObserverStubBuilder } from '@datadog/browser-core'

import { restorePageVisibility, setPageVisibility } from '../../core/src/specHelper'
import { LifeCycle } from '../src/lifeCycle'
import { startPerformanceCollection } from '../src/performanceCollection'

interface BrowserWindow extends Window {
  PerformanceObserver?: PerformanceObserver
}

describe('rum first_contentful_paint', () => {
  let stubBuilder: PerformanceObserverStubBuilder
  let original: PerformanceObserver | undefined
  let lifeCycle: LifeCycle

  const browserWindow = window as BrowserWindow
  const session = {
    getId: () => undefined,
    isTracked: () => true,
    isTrackedWithResource: () => true,
  }

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }

    lifeCycle = new LifeCycle()
    original = browserWindow.PerformanceObserver
    stubBuilder = new PerformanceObserverStubBuilder()
    browserWindow.PerformanceObserver = stubBuilder.getStub()
  })

  afterEach(() => {
    browserWindow.PerformanceObserver = original
    restorePageVisibility()
  })

  it('should not be collected when page starts not visible', () => {
    setPageVisibility('hidden')
    startPerformanceCollection(lifeCycle, session)

    expect(stubBuilder.getEntryTypes()).not.toContain('paint')
  })

  it('should be collected when page starts visible', () => {
    setPageVisibility('visible')
    startPerformanceCollection(lifeCycle, session)

    expect(stubBuilder.getEntryTypes()).toContain('paint')
  })
})
