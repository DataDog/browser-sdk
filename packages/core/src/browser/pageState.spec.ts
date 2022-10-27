import { restorePageVisibility, setPageVisibility } from '../../test/specHelper'
import type { PageExitEvent, PageState } from './pageState'
import { createPageState } from './pageState'

describe('createPageState', () => {
  let pageState: PageState
  let onExitSpy: jasmine.Spy<(event: PageExitEvent) => void>

  beforeEach(() => {
    pageState = createPageState()
    onExitSpy = jasmine.createSpy()
    pageState.onExit(onExitSpy)
  })

  afterEach(() => {
    pageState.stop()
    restorePageVisibility()
  })

  it('calls onExit listeners when the page is unloading', () => {
    window.dispatchEvent(new Event('beforeunload'))
    expect(onExitSpy).toHaveBeenCalledOnceWith({ isUnloading: true })
  })

  it('calls onExit listeners when the page becomes hidden', () => {
    emulatePageVisibilityChange('hidden')
    expect(onExitSpy).toHaveBeenCalledOnceWith({ isUnloading: false })
  })

  it('calls onExit listeners every time the page is unloading', () => {
    window.dispatchEvent(new Event('beforeunload'))
    window.dispatchEvent(new Event('beforeunload'))

    expect(onExitSpy).toHaveBeenCalledTimes(2)
  })

  it('does not call onExit listeners when the visibility changes after the page is unloading', () => {
    window.dispatchEvent(new Event('beforeunload'))
    emulatePageVisibilityChange('hidden')
    emulatePageVisibilityChange('visible')
    emulatePageVisibilityChange('hidden')

    expect(onExitSpy).toHaveBeenCalledOnceWith({ isUnloading: true })
  })

  it('does not call onExit listeners when the page becomes visible', () => {
    emulatePageVisibilityChange('visible')

    expect(onExitSpy).not.toHaveBeenCalled()
  })

  it('calls onExit listeners each time the page becomes hidden', () => {
    emulatePageVisibilityChange('hidden')
    emulatePageVisibilityChange('visible')
    emulatePageVisibilityChange('hidden')
    expect(onExitSpy).toHaveBeenCalledTimes(2)
  })

  function emulatePageVisibilityChange(visibility: 'visible' | 'hidden') {
    setPageVisibility(visibility)
    document.dispatchEvent(new Event('visibilitychange'))
  }
})
