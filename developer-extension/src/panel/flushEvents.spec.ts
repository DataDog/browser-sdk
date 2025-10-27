import type { Configuration } from '@datadog/browser-core'
import { registerCleanupTask } from '../../../packages/core/test'
import type { PageMayExitEvent } from '../../../packages/core/src/browser/pageMayExitObservable'
import { createPageMayExitObservable } from '../../../packages/core/src/browser/pageMayExitObservable'
import { flushScript } from './flushEvents'

describe('flushEvents', () => {
  let onExitSpy: jasmine.Spy<(event: PageMayExitEvent) => void>
  let configuration: Configuration

  beforeEach(() => {
    onExitSpy = jasmine.createSpy()
    configuration = {} as Configuration
    registerCleanupTask(createPageMayExitObservable(configuration).subscribe(onExitSpy).unsubscribe)
  })

  it('flushes when the flush scripts evaluated', () => {
    // evalInWindow() uses extension APIs that are not available in the test environment
    // eslint-disable-next-line no-eval
    eval(flushScript)
    expect(onExitSpy).toHaveBeenCalled()
  })
})
