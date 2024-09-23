import type { Configuration } from '../domain/configuration'
import { createNewEvent, restorePageVisibility, setPageVisibility, registerCleanupTask } from '../../test'
import type { PageExitEvent } from './pageExitObservable'
import { PageExitReason, createPageExitObservable } from './pageExitObservable'

describe('createPageExitObservable', () => {
  let onExitSpy: jasmine.Spy<(event: PageExitEvent) => void>
  let configuration: Configuration

  beforeEach(() => {
    onExitSpy = jasmine.createSpy()
    configuration = {} as Configuration
    registerCleanupTask(createPageExitObservable(configuration).subscribe(onExitSpy).unsubscribe)
  })

  afterEach(() => {
    restorePageVisibility()
  })

  it('notifies when the page fires unload', () => {
    window.dispatchEvent(createNewEvent('unload'))

    expect(onExitSpy).toHaveBeenCalledOnceWith({ reason: PageExitReason.UNLOADING })
  })

  it('notifies when the page becomes hidden', () => {
    emulatePageVisibilityChange('hidden')

    expect(onExitSpy).toHaveBeenCalledOnceWith({ reason: PageExitReason.HIDDEN })
  })

  it('notifies when the page becomes frozen', () => {
    window.dispatchEvent(createNewEvent('freeze'))

    expect(onExitSpy).toHaveBeenCalledOnceWith({ reason: PageExitReason.FROZEN })
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
