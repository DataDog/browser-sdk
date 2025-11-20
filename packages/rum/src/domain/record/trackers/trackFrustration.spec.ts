import type { RawRumActionEvent } from '@datadog/browser-rum-core'
import { ActionType, LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { RawRumEventCollectedData } from 'packages/rum-core/src/domain/lifeCycle'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createRumFrustrationEvent } from '../../../../test'
import type { FrustrationRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { RecordIds } from '../recordIds'
import { initRecordIds } from '../recordIds'
import type { EmitRecordCallback } from '../record.types'
import { trackFrustration } from './trackFrustration'
import type { Tracker } from './tracker.types'

describe('trackFrustration', () => {
  const lifeCycle = new LifeCycle()
  let frustrationTracker: Tracker
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback<FrustrationRecord>>
  let mouseEvent: MouseEvent
  let rumData: RawRumEventCollectedData<RawRumActionEvent>
  let recordIds: RecordIds

  beforeEach(() => {
    mouseEvent = new MouseEvent('pointerup')
    emitRecordCallback = jasmine.createSpy()
    recordIds = initRecordIds()

    rumData = createRumFrustrationEvent(mouseEvent)

    registerCleanupTask(() => {
      frustrationTracker.stop()
    })
  })

  it('calls callback if the raw data inserted is a click action', () => {
    frustrationTracker = trackFrustration(lifeCycle, emitRecordCallback, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    const frustrationRecord = emitRecordCallback.calls.first().args[0]
    expect(frustrationRecord.type).toEqual(RecordType.FrustrationRecord)
    expect(frustrationRecord.timestamp).toEqual(rumData.rawRumEvent.date)
    expect(frustrationRecord.data.frustrationTypes).toEqual(rumData.rawRumEvent.action.frustration!.type)
    expect(frustrationRecord.data.recordIds).toEqual([recordIds.getIdForEvent(mouseEvent)])
  })

  it('ignores events other than click actions', () => {
    rumData.rawRumEvent.action.type = ActionType.CUSTOM
    frustrationTracker = trackFrustration(lifeCycle, emitRecordCallback, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(emitRecordCallback).not.toHaveBeenCalled()
  })

  it('ignores click actions without frustrations', () => {
    rumData.rawRumEvent.action.frustration = { type: [] }

    frustrationTracker = trackFrustration(lifeCycle, emitRecordCallback, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(emitRecordCallback).not.toHaveBeenCalled()
  })

  it('ignores click actions which are missing the original mouse events', () => {
    rumData.domainContext = {}

    frustrationTracker = trackFrustration(lifeCycle, emitRecordCallback, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(emitRecordCallback).not.toHaveBeenCalled()
  })
})
