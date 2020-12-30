import { createNewEvent, DOM_EVENT, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { CreationReason } from '../types'
import { trackSegmentRenewal } from './trackSegmentRenewal'

describe('trackSegmentRenewal', () => {
  let renewSegmentSpy: jasmine.Spy<(reason: CreationReason) => void>
  let lifeCycle: LifeCycle
  let eventEmitter: HTMLDivElement
  let stopSegmentRenewal: () => void

  beforeEach(() => {
    renewSegmentSpy = jasmine.createSpy()
    lifeCycle = new LifeCycle()
    eventEmitter = document.createElement('div')
    ;({ stop: stopSegmentRenewal } = trackSegmentRenewal(lifeCycle, renewSegmentSpy, eventEmitter))
  })

  afterEach(() => {
    stopSegmentRenewal()
    restorePageVisibility()
  })

  it('renews segment on unload', () => {
    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)
    expect(renewSegmentSpy).toHaveBeenCalledWith('before_unload')
  })

  it('renews segment on view change', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {} as any)
    expect(renewSegmentSpy).toHaveBeenCalledWith('view_change')
  })

  it('renews segment on session renew', () => {
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    expect(renewSegmentSpy).toHaveBeenCalledWith('session_renewed')
  })

  it('renews segment when the page become hidden', () => {
    setPageVisibility('hidden')
    eventEmitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))
    expect(renewSegmentSpy).toHaveBeenCalledWith('visibility_change')
  })

  it('does not renew segment when the page become visible', () => {
    setPageVisibility('visible')
    eventEmitter.dispatchEvent(createNewEvent(DOM_EVENT.VISIBILITY_CHANGE))
    expect(renewSegmentSpy).not.toHaveBeenCalled()
  })
})
