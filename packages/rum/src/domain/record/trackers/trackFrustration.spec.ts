import { isIE, relativeNow, timeStampNow } from '@datadog/browser-core'
import type { RawRumActionEvent } from '@datadog/browser-rum-core'
import { ActionType, LifeCycle, LifeCycleEventType, RumEventType, FrustrationType } from '@datadog/browser-rum-core'
import type { RawRumEventCollectedData } from 'packages/rum-core/src/domain/lifeCycle'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { RecordType } from '../../../types'
import type { RecordIds } from '../recordIds'
import { initRecordIds } from '../recordIds'
import type { FrustrationCallback } from './trackFrustration'
import { trackFrustration } from './trackFrustration'
import type { Tracker } from './tracker.types'

describe('trackFrustration', () => {
  const lifeCycle = new LifeCycle()
  let stopFrustrationTracker: Tracker
  let frustrationsCallbackSpy: jasmine.Spy<FrustrationCallback>
  let mouseEvent: MouseEvent
  let rumData: RawRumEventCollectedData<RawRumActionEvent>
  let recordIds: RecordIds

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    mouseEvent = new MouseEvent('pointerup')
    frustrationsCallbackSpy = jasmine.createSpy()
    recordIds = initRecordIds()

    rumData = {
      startTime: relativeNow(),
      rawRumEvent: {
        date: timeStampNow(),
        type: RumEventType.ACTION,
        action: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          type: ActionType.CLICK,
          frustration: {
            type: [FrustrationType.DEAD_CLICK],
          },
          target: {
            name: '123e4567-e89b-12d3-a456-426614174000',
          },
        },
      },
      domainContext: { events: [mouseEvent] },
    }

    registerCleanupTask(() => {
      stopFrustrationTracker()
    })
  })

  it('calls callback if the raw data inserted is a click action', () => {
    stopFrustrationTracker = trackFrustration(lifeCycle, frustrationsCallbackSpy, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    const frustrationRecord = frustrationsCallbackSpy.calls.first().args[0]
    expect(frustrationRecord.type).toEqual(RecordType.FrustrationRecord)
    expect(frustrationRecord.timestamp).toEqual(rumData.rawRumEvent.date)
    expect(frustrationRecord.data.frustrationTypes).toEqual(rumData.rawRumEvent.action.frustration!.type)
    expect(frustrationRecord.data.recordIds).toEqual([recordIds.getIdForEvent(mouseEvent)])
  })

  it('ignores events other than click actions', () => {
    rumData.rawRumEvent.action.type = ActionType.CUSTOM
    stopFrustrationTracker = trackFrustration(lifeCycle, frustrationsCallbackSpy, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions without frustrations', () => {
    rumData.rawRumEvent.action.frustration = { type: [] }

    stopFrustrationTracker = trackFrustration(lifeCycle, frustrationsCallbackSpy, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions which are missing the original mouse events', () => {
    rumData.domainContext = {}

    stopFrustrationTracker = trackFrustration(lifeCycle, frustrationsCallbackSpy, recordIds)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })
})
