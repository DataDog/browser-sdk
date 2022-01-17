import { toServerDuration, relativeToClocks, generateUUID } from '@datadog/browser-core'
import type { RawRumLongTaskEvent } from '../../../rawRumEvent.types'
import { RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumSessionManager } from '../../rumSessionManager'

export function startLongTaskCollection(lifeCycle: LifeCycle, sessionManager: RumSessionManager) {
  lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
    if (entry.entryType !== 'longtask') {
      return
    }
    const session = sessionManager.findTrackedSession(entry.startTime)
    if (!session || session.hasLitePlan) {
      return
    }
    const startClocks = relativeToClocks(entry.startTime)
    const rawRumEvent: RawRumLongTaskEvent = {
      date: startClocks.timeStamp,
      long_task: {
        id: generateUUID(),
        duration: toServerDuration(entry.duration),
      },
      type: RumEventType.LONG_TASK,
    }
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent,
      startTime: startClocks.relative,
      domainContext: { performanceEntry: entry.toJSON() },
    })
  })
}
