import type { RawRumActionEvent } from '@datadog/browser-rum-core'
import { ActionType, LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { RawRumEventCollectedData } from 'packages/rum-core/src/domain/lifeCycle'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createRumFrustrationEvent } from '../../../../test'
import type { FrustrationRecord } from '../../../types'
import { RecordType } from '../../../types'
import type { EmitRecordCallback, SerializationScope } from '../serialization'
import { createSerializationScopeForTesting } from '../test/serializationScope.specHelper'
import { trackFrustration } from './trackFrustration'
import type { Tracker } from './tracker.types'

describe('trackFrustration', () => {
  const lifeCycle = new LifeCycle()
  let frustrationTracker: Tracker
  let frustrationsCallbackSpy: jasmine.Spy<EmitRecordCallback>
  let mouseEvent: MouseEvent
  let rumData: RawRumEventCollectedData<RawRumActionEvent>
  let scope: SerializationScope

  beforeEach(() => {
    frustrationsCallbackSpy = jasmine.createSpy()
    scope = createSerializationScopeForTesting({ emitRecord: frustrationsCallbackSpy })

    mouseEvent = new MouseEvent('pointerup')
    rumData = createRumFrustrationEvent(mouseEvent)

    registerCleanupTask(() => {
      frustrationTracker.stop()
    })
  })

  function getLatestFrustrationRecord(): FrustrationRecord {
    return frustrationsCallbackSpy.calls.mostRecent()?.args[0] as FrustrationRecord
  }

  it('calls callback if the raw data inserted is a click action', () => {
    frustrationTracker = trackFrustration(lifeCycle, scope)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    const frustrationRecord = getLatestFrustrationRecord()
    expect(frustrationRecord.type).toEqual(RecordType.FrustrationRecord)
    expect(frustrationRecord.timestamp).toEqual(rumData.rawRumEvent.date)
    expect(frustrationRecord.data.frustrationTypes).toEqual(rumData.rawRumEvent.action.frustration!.type)
    expect(frustrationRecord.data.recordIds).toEqual([scope.eventIds.getIdForEvent(mouseEvent)])
  })

  it('ignores events other than click actions', () => {
    rumData.rawRumEvent.action.type = ActionType.CUSTOM
    frustrationTracker = trackFrustration(lifeCycle, scope)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions without frustrations', () => {
    rumData.rawRumEvent.action.frustration = { type: [] }

    frustrationTracker = trackFrustration(lifeCycle, scope)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions which are missing the original mouse events', () => {
    rumData.domainContext = {}

    frustrationTracker = trackFrustration(lifeCycle, scope)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })
})
