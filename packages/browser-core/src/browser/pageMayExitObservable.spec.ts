import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { createNewEvent, restorePageVisibility, setPageVisibility, registerCleanupTask } from '../../test'
import type { PageMayExitEvent } from './pageMayExitObservable'
import { PageExitReason, createPageMayExitObservable } from './pageMayExitObservable'

describe('createPageMayExitObservable', () => {
  let onExitSpy: Mock<(event: PageMayExitEvent) => void>

  beforeEach(() => {
    onExitSpy = vi.fn()
    registerCleanupTask(createPageMayExitObservable().subscribe(onExitSpy).unsubscribe)
  })

  afterEach(() => {
    restorePageVisibility()
  })

  it('notifies when the page fires beforeunload', () => {
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(onExitSpy).toHaveBeenCalledExactlyOnceWith({ reason: PageExitReason.UNLOADING })
  })

  it('notifies when the page becomes hidden', () => {
    emulatePageVisibilityChange('hidden')

    expect(onExitSpy).toHaveBeenCalledExactlyOnceWith({ reason: PageExitReason.HIDDEN })
  })

  it('notifies when the page becomes frozen', () => {
    window.dispatchEvent(createNewEvent('freeze'))

    expect(onExitSpy).toHaveBeenCalledExactlyOnceWith({ reason: PageExitReason.FROZEN })
  })

  it('notifies multiple times', () => {
    window.dispatchEvent(createNewEvent('beforeunload'))
    window.dispatchEvent(createNewEvent('beforeunload'))
    emulatePageVisibilityChange('hidden')

    expect(onExitSpy).toHaveBeenCalledTimes(3)
  })

  it('does not notify when the page becomes visible', () => {
    emulatePageVisibilityChange('visible')

    expect(onExitSpy).not.toHaveBeenCalled()
  })

  it('notifies page_terminated when pagehide fires without bfcache', () => {
    window.dispatchEvent(createNewEvent('pagehide', { persisted: false }))

    expect(onExitSpy).toHaveBeenCalledExactlyOnceWith({ reason: PageExitReason.PAGE_TERMINATED })
  })

  it('does not notify when pagehide fires for bfcache', () => {
    window.dispatchEvent(createNewEvent('pagehide', { persisted: true }))

    expect(onExitSpy).not.toHaveBeenCalled()
  })

  function emulatePageVisibilityChange(visibility: 'visible' | 'hidden') {
    setPageVisibility(visibility)
    document.dispatchEvent(createNewEvent('visibilitychange'))
  }
})
