import { createNewEvent, restorePageVisibility, setPageVisibility } from '../../test'
import { resetExperimentalFeatures, addExperimentalFeatures, ExperimentalFeature } from '../domain/configuration'
import type { Subscription } from '../tools/observable'
import type { PageExitEvent } from './pageExitObservable'
import { PageExitReason, createPageExitObservable } from './pageExitObservable'

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
    resetExperimentalFeatures()
  })

  it('notifies when the page fires pagehide if ff pagehide is enabled', () => {
    addExperimentalFeatures([ExperimentalFeature.PAGEHIDE])
    onExitSpy = jasmine.createSpy()
    pageExitSubscription = createPageExitObservable().subscribe(onExitSpy)

    window.dispatchEvent(createNewEvent('pagehide'))
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(onExitSpy).toHaveBeenCalledOnceWith({ reason: PageExitReason.PAGEHIDE })
  })

  it('notifies when the page fires beforeunload if ff pagehide is disabled', () => {
    window.dispatchEvent(createNewEvent('pagehide'))
    window.dispatchEvent(createNewEvent('beforeunload'))

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
