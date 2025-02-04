import type { RawRumActionEvent } from '@datadog/browser-rum-core'
import { ActionType, LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { RawRumEventCollectedData } from 'packages/rum-core/src/domain/lifeCycle'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createRumFrustrationEvent } from '../../../../test'
import { RecordType } from '../../../types'
import type { RecordIds } from '../recordIds'
import { initRecordIds } from '../recordIds'
import type { FrustrationCallback } from './trackFrustration'
import { trackFrustration } from './trackFrustration'
import type { Tracker } from './tracker.types'

describe('trackFrustration', () => {
  const lifeCycle = new LifeCycle()
  let frustrationTracker: Tracker
  let frustrationsCallbackSpy: jasmine.Spy<FrustrationCallback>
  let mouseEvent: MouseEvent
  let rumData: RawRumEventCollectedData<RawRumActionEvent>
  let recordIds: RecordIds

  beforeEach(() => {
    mouseEvent = new MouseEvent('pointerup')
    frustrationsCallbackSpy = jasmine.createSpy()
    recordIds = initRecordIds()

    rumData = createRumFrustrationEvent(mouseEvent)

    registerCleanupTask(() => {
      frustrationTracker.stop()
    })
  })

  it('calls callback if the raw data inserted is a click action', () => {
    frustrationTracker = trackFrustration(lifeCycle, frustrationsCallbackSpy, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    const frustrationRecord = frustrationsCallbackSpy.calls.first().args[0]
    expect(frustrationRecord.type).toEqual(RecordType.FrustrationRecord)
    expect(frustrationRecord.timestamp).toEqual(rumData.rawRumEvent.date)
    expect(frustrationRecord.data.frustrationTypes).toEqual(rumData.rawRumEvent.action.frustration!.type)
    expect(frustrationRecord.data.recordIds).toEqual([recordIds.getIdForEvent(mouseEvent)])
  })

  it('ignores events other than click actions', () => {
    rumData.rawRumEvent.action.type = ActionType.CUSTOM
    frustrationTracker = trackFrustration(lifeCycle, frustrationsCallbackSpy, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions without frustrations', () => {
    rumData.rawRumEvent.action.frustration = { type: [] }

    frustrationTracker = trackFrustration(lifeCycle, frustrationsCallbackSpy, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions which are missing the original mouse events', () => {
    rumData.domainContext = {}

    frustrationTracker = trackFrustration(lifeCycle, frustrationsCallbackSpy, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })
})
