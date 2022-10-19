import { setPageVisibility } from '../../test/specHelper'
import type { PageExitEvent, PageExitState } from './pageExitState'
import { createPageExitState } from './pageExitState'

describe('pageExitState', () => {
  let pageExitState: PageExitState
  let onPageExitSpy: jasmine.Spy<(event: PageExitEvent) => void>

  beforeEach(() => {
    pageExitState = createPageExitState()
    onPageExitSpy = jasmine.createSpy()
    pageExitState.onPageExit(onPageExitSpy)
  })

  afterEach(() => {
    pageExitState.stop()
  })

  it('calls onPageExit listeners when the page is unloading', () => {
    window.dispatchEvent(new Event('beforeunload'))
    expect(onPageExitSpy).toHaveBeenCalledOnceWith({ isUnloading: true })
  })

  it('calls onPageExit listeners when the page becomes hidden', () => {
    emulatePageVisibilityChange('hidden')
    expect(onPageExitSpy).toHaveBeenCalledOnceWith({ isUnloading: false })
  })

  it('calls onPageExit listeners only once when the page it unloading', () => {
    window.dispatchEvent(new Event('beforeunload'))

    window.dispatchEvent(new Event('beforeunload'))
    emulatePageVisibilityChange('hidden')
    emulatePageVisibilityChange('visible')
    emulatePageVisibilityChange('hidden')

    expect(onPageExitSpy).toHaveBeenCalledOnceWith({ isUnloading: true })
  })

  it('does not call onPageExit listeners when the page becomes visible', () => {
    emulatePageVisibilityChange('visible')

    expect(onPageExitSpy).not.toHaveBeenCalled()
  })

  it('calls onPageExit listeners each time the page becomes hidden', () => {
    emulatePageVisibilityChange('hidden')
    emulatePageVisibilityChange('visible')
    emulatePageVisibilityChange('hidden')
    expect(onPageExitSpy).toHaveBeenCalledTimes(2)
  })

  function emulatePageVisibilityChange(visibility: 'visible' | 'hidden') {
    setPageVisibility(visibility)
    document.dispatchEvent(new Event('visibilitychange'))
  }
})
