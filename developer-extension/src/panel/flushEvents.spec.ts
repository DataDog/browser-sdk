import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { registerCleanupTask } from '../../../packages/browser-core/test'
import type { PageMayExitEvent } from '../../../packages/browser-core/src/browser/pageMayExitObservable'
import { createPageMayExitObservable } from '../../../packages/browser-core/src/browser/pageMayExitObservable'
import { flushScript } from './flushEvents'

describe('flushEvents', () => {
  let onExitSpy: Mock<(event: PageMayExitEvent) => void>

  beforeEach(() => {
    onExitSpy = vi.fn()
    registerCleanupTask(createPageMayExitObservable().subscribe(onExitSpy).unsubscribe)
  })

  it('flushes when the flush scripts evaluated', () => {
    // evalInWindow() uses extension APIs that are not available in the test environment
    // eslint-disable-next-line no-eval
    eval(flushScript)
    expect(onExitSpy).toHaveBeenCalled()
  })
})
