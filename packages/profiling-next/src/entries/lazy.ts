import { addDuration, createValueHistory, noop, relativeToClocks, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { AbstractHooks, DeflateEncoderStreamId, Duration, Encoder, RelativeTime } from '@datadog/browser-core'
import { MessageType } from '@datadog/browser-internal-next'
import type { CoreInitializeConfiguration, CoreSessionManager, InternalApi } from '@datadog/browser-internal-next'
import type { LongTaskContext, LongTaskContexts, RumLongTaskEventDomainContext } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType, validateAndBuildRumConfiguration } from '@datadog/browser-rum-core'
import { createRumProfiler } from '@datadog/browser-rum/internal'
import { startProfilingContext } from '../profilingContext'

const LONG_TASK_ID_HISTORY_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export function initialize({
  coreInitializeConfiguration,
  sessionManager,
  internalApi,
  hooks,
  createEncoder,
}: {
  coreInitializeConfiguration: CoreInitializeConfiguration
  sessionManager: CoreSessionManager
  hooks: AbstractHooks
  internalApi: InternalApi
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
}) {
  const configuration = validateAndBuildRumConfiguration({
    ...coreInitializeConfiguration,
    ...coreInitializeConfiguration.rum!,
  })
  if (!configuration) {
    return
  }
  const lifeCycle = new LifeCycle()

  const profilingContextManager = startProfilingContext(hooks)

  let profilerWasStarted = false

  internalApi.bus.subscribe(({ message }) => {
    switch (message.type) {
      case MessageType.RUM_RAW_EVENT_COLLECTED:
        lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, message.data)
        break
      case MessageType.RUM_VIEW_CREATED:
        if (!profilerWasStarted) {
          const profiler = createRumProfiler(
            configuration,
            lifeCycle,
            sessionManager,
            profilingContextManager,
            createLongTaskContexts(internalApi),
            createEncoder,
            // TODO: change profiler so they don't require a full view history...
            {
              findView() {
                return message.event
              },
              stop: noop,
            }
          )
          profiler.start()
          profilerWasStarted = true
        }
        lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, message.event)
        break
    }
  })
}

function createLongTaskContexts(internalApi: InternalApi): LongTaskContexts {
  // const history = createValueHistory<LongTaskContext>({
  //   expireDelay: LONG_TASK_ID_HISTORY_TIME_OUT_DELAY,
  // })
  const longTasks: LongTaskContext[] = []

  internalApi.bus.subscribe(({ message }) => {
    if (message.type === MessageType.RUM_RAW_EVENT_COLLECTED && message.data.rawRumEvent.type === 'long_task') {
      const { id } = message.data.rawRumEvent.long_task
      const entry = (message.data.domainContext as RumLongTaskEventDomainContext).performanceEntry
      const startClocks = relativeToClocks(entry.startTime as RelativeTime)
      longTasks.push({
        id,
        startClocks,
        duration: entry.duration as Duration,
        entryType: entry.entryType as any,
      })
      // history.closeActive(addDuration(startClocks.relative, entry.duration as Duration))
    }
  })

  return {
    findLongTasks: () => longTasks,
  }
}
