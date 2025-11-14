import { noop } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { EmitRecordCallback } from '../serialization'
import { createSerializationScopeForTesting } from '../test/serializationScope.specHelper'
import { RecordType } from '../../../types'
import { trackViewEnd } from './trackViewEnd'
import type { Tracker } from './tracker.types'

describe('trackViewEnd', () => {
  let lifeCycle: LifeCycle
  let viewEndCb: jasmine.Spy<EmitRecordCallback>
  let viewEndTracker: Tracker

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    viewEndCb = jasmine.createSpy()
    const scope = createSerializationScopeForTesting({ emitRecord: viewEndCb })
    viewEndTracker = trackViewEnd(lifeCycle, scope, noop)
  })

  afterEach(() => {
    viewEndTracker.stop()
  })

  it('should generate view end record', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)

    expect(viewEndCb).toHaveBeenCalledWith({
      timestamp: jasmine.any(Number),
      type: RecordType.ViewEnd,
    })
  })
})
