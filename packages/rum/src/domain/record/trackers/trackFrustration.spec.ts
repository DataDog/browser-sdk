import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { RawRumActionEvent } from '@datadog/browser-rum-core'
import { ActionType, LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { RawRumEventCollectedData } from '@datadog/browser-rum-core/src/domain/lifeCycle'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createRumFrustrationEvent } from '../../../../test'
import type { FrustrationRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackFrustration } from './trackFrustration'
import type { Tracker } from './tracker.types'

describe('trackFrustration', () => {
  const lifeCycle = new LifeCycle()
  let frustrationTracker: Tracker
  let emitRecordCallback: Mock<EmitRecordCallback<FrustrationRecord>>
  let mouseEvent: MouseEvent
  let rumData: RawRumEventCollectedData<RawRumActionEvent>
  let scope: RecordingScope

  beforeEach(() => {
    emitRecordCallback = vi.fn()
    scope = createRecordingScopeForTesting()

    mouseEvent = new MouseEvent('pointerup')
    rumData = createRumFrustrationEvent(mouseEvent)

    frustrationTracker = trackFrustration(lifeCycle, emitRecordCallback, scope)
    registerCleanupTask(() => {
      frustrationTracker.stop()
    })
  })

  function getLatestFrustrationRecord(): FrustrationRecord {
    return emitRecordCallback.mock.lastCall?.[0]
  }

  it('calls callback if the raw data inserted is a click action', () => {
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    const frustrationRecord = getLatestFrustrationRecord()
    expect(frustrationRecord.type).toEqual(RecordType.FrustrationRecord)
    expect(frustrationRecord.timestamp).toEqual(rumData.rawRumEvent.date)
    expect(frustrationRecord.data.frustrationTypes).toEqual(rumData.rawRumEvent.action.frustration!.type)
    expect(frustrationRecord.data.recordIds).toEqual([scope.eventIds.getOrInsert(mouseEvent)])
  })

  it('ignores events other than click actions', () => {
    rumData.rawRumEvent.action.type = ActionType.CUSTOM
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)
    expect(emitRecordCallback).not.toHaveBeenCalled()
  })

  it('ignores click actions without frustrations', () => {
    rumData.rawRumEvent.action.frustration = { type: [] }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)
    expect(emitRecordCallback).not.toHaveBeenCalled()
  })

  it('ignores click actions which are missing the original mouse events', () => {
    rumData.domainContext = {}
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)
    expect(emitRecordCallback).not.toHaveBeenCalled()
  })
})
