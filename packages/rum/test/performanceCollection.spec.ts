import { isIE } from '@datadog/browser-core'

import { restorePageVisibility, setPageVisibility } from '../../core/src/specHelper'
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
