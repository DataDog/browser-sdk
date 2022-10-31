import { restorePageVisibility, setPageVisibility } from '../../test/specHelper'
import type { Subscription } from '../tools/observable'
import type { PageExitEvent } from './pageExitObservable'
import { createPageExitObservable } from './pageExitObservable'

describe('createPageExitObservable', () => {
  let pageExitSubscription: Subscription
  let onExitSpy: jasmine.Spy<(event: PageExitEvent) => void>

  beforeEach(() => {
    onExitSpy = jasmine.createSpy()
    pageExitSubscription = createPageExitObservable().subscribe(onExitSpy)
  })

  afterEach(() => {
    pageExitSubscription.unsubscribe()
    restorePageVisibility()
  })

  it('notifies when the page is unloading', () => {
    window.dispatchEvent(new Event('beforeunload'))

    expect(onExitSpy).toHaveBeenCalledOnceWith({ isUnloading: true })
  })

  it('notifies when the page becomes hidden', () => {
    emulatePageVisibilityChange('hidden')

    expect(onExitSpy).toHaveBeenCalledOnceWith({ isUnloading: false })
  })

  it('notifies multiple times', () => {
    window.dispatchEvent(new Event('beforeunload'))
    window.dispatchEvent(new Event('beforeunload'))
    emulatePageVisibilityChange('hidden')

    expect(onExitSpy).toHaveBeenCalledTimes(3)
  })

  it('does notify when the page becomes visible', () => {
    emulatePageVisibilityChange('visible')

    expect(onExitSpy).not.toHaveBeenCalled()
  })

  function emulatePageVisibilityChange(visibility: 'visible' | 'hidden') {
    setPageVisibility(visibility)
    document.dispatchEvent(new Event('visibilitychange'))
  }
})
