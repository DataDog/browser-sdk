import { vi, type Mock } from 'vitest'
import type { Configuration } from '../domain/configuration'
import { createNewEvent, restorePageVisibility, setPageVisibility, registerCleanupTask } from '../../test'
import type { PageMayExitEvent } from './pageMayExitObservable'
import { PageExitReason, createPageMayExitObservable } from './pageMayExitObservable'

describe('createPageMayExitObservable', () => {
  let onExitSpy: Mock<(event: PageMayExitEvent) => void>
  let configuration: Configuration

  beforeEach(() => {
    onExitSpy = vi.fn()
    configuration = {} as Configuration
    registerCleanupTask(createPageMayExitObservable(configuration).subscribe(onExitSpy).unsubscribe)
  })

  afterEach(() => {
    restorePageVisibility()
  })

  it('notifies when the page fires beforeunload', () => {
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(onExitSpy).toHaveBeenCalledTimes(1)
    expect(onExitSpy).toHaveBeenCalledWith({ reason: PageExitReason.UNLOADING })
  })

  it('notifies when the page becomes hidden', () => {
    emulatePageVisibilityChange('hidden')

    expect(onExitSpy).toHaveBeenCalledTimes(1)
    expect(onExitSpy).toHaveBeenCalledWith({ reason: PageExitReason.HIDDEN })
  })

  it('notifies when the page becomes frozen', () => {
    window.dispatchEvent(createNewEvent('freeze'))

    expect(onExitSpy).toHaveBeenCalledTimes(1)
    expect(onExitSpy).toHaveBeenCalledWith({ reason: PageExitReason.FROZEN })
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

  function emulatePageVisibilityChange(visibility: 'visible' | 'hidden') {
    setPageVisibility(visibility)
    document.dispatchEvent(createNewEvent('visibilitychange'))
  }
})
