import type { Component, Context } from '@datadog/browser-core'
import { getEventBridge } from '@datadog/browser-core'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType, startLogsLifeCycle } from '../domain/lifeCycle'
import type { LogsEvent } from '../logsEvent.types'

export const startLogsBridge: Component<void, [LifeCycle]> = (lifeCycle: LifeCycle) => {
  const bridge = getEventBridge<'log', LogsEvent>()!

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    bridge.send('log', serverLogsEvent)
  })
}
/* eslint-disable local-rules/disallow-side-effects */
startLogsBridge.$deps = [startLogsLifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
