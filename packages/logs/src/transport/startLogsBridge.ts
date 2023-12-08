import type { Context } from '@datadog/browser-core'
import { getEventBridge } from '@datadog/browser-core'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { LogsEvent } from '../logsEvent.types'
import { LogsComponents } from '../boot/logsComponents'

export function startLogsBridge(lifeCycle: LifeCycle) {
  const bridge = getEventBridge<'log', LogsEvent>()!

  lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverLogsEvent: LogsEvent & Context) => {
    bridge.send('log', serverLogsEvent)
  })
}
/* eslint-disable local-rules/disallow-side-effects */
startLogsBridge.$id = LogsComponents.LogsTransport
startLogsBridge.$deps = [LogsComponents.LifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
