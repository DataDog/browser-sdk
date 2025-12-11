import type { Observable, Context, Batch } from '@datadog/browser-core'
import { HookNames, DISCARDED, combine } from '@datadog/browser-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { Hooks } from '../../hooks'
import type { CollectedRumEvent } from './events'

export function startRumEventAssembleAndSend(
  onRumEventObservable: Observable<CollectedRumEvent>,
  rumBatch: Batch,
  hooks: Hooks
) {
  onRumEventObservable.subscribe(({ event, source }) => {
    const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
      eventType: event.type,
    })!

    if (defaultRumEventAttributes === DISCARDED) {
      return
    }
    const commonContext =
      source === 'renderer'
        ? {
            session: { id: defaultRumEventAttributes.session!.id },
            application: { id: defaultRumEventAttributes.application!.id },
          }
        : combine(defaultRumEventAttributes, {
            // TODO source electron
            source: 'browser' as const,
            application: { id: defaultRumEventAttributes.application!.id },
            session: {
              type: 'user' as const,
            },
            _dd: {
              format_version: 2 as const,
            },
          })

    const serverRumEvent = combine(commonContext, event)

    if (serverRumEvent.type === RumEventType.VIEW) {
      rumBatch.upsert(serverRumEvent as unknown as Context, serverRumEvent.view.id)
    } else {
      rumBatch.add(serverRumEvent as unknown as Context)
    }
  })
}
