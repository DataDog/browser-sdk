import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import type { ViewEndCallback } from './viewEndObserver'
import { initViewEndObserver } from './viewEndObserver'

describe('initMoveObserver', () => {
  let lifeCycle: LifeCycle
  let viewEndCb: jasmine.Spy<ViewEndCallback>
  let stopObserver: () => void

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    viewEndCb = jasmine.createSpy()
    stopObserver = initViewEndObserver(lifeCycle, viewEndCb)
  })

  afterEach(() => {
    stopObserver()
  })

  it('should generate view end record', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)

    expect(viewEndCb).toHaveBeenCalledWith({
      timestamp: jasmine.any(Number),
      type: RecordType.ViewEnd,
    })
  })
})
