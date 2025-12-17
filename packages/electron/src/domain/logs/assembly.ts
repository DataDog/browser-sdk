import type { Observable, Context, Batch } from '@datadog/browser-core'
import { HookNames, DISCARDED, combine } from '@datadog/browser-core'
import type { LogsEvent } from '@datadog/browser-logs'
import type { Hooks } from '../../hooks'

export function startLogsEventAssembleAndSend(
  onLogsEventObservable: Observable<LogsEvent>,
  logsBatch: Batch,
  hooks: Hooks
) {
  onLogsEventObservable.subscribe((event) => {
    const defaultLogsEventAttributes = hooks.triggerHook(HookNames.Assemble, {
      eventType: 'log' as any,
    })!

    if (defaultLogsEventAttributes === DISCARDED) {
      return
    }

    const serverLogEvent = combine(event as Context, {
      session_id: defaultLogsEventAttributes.session!.id,
      application_id: defaultLogsEventAttributes.application!.id,
    })

    logsBatch.add(serverLogEvent)
  })
}
