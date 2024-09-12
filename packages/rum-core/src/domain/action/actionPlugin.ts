import type { Observable } from '@datadog/browser-core'
import type { RumEvent, RumErrorEvent, RumLongTaskEvent, RumResourceEvent } from '../../rumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import type { Mutable } from '../assembly'
import type { CommonContext } from '../contexts/commonContext'
import type { LifeCycle } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { RumPlugin } from '../plugins'
import { startActionCollection } from './actionCollection'
import type { ActionContexts, CustomAction } from './actionCollection'

export type ActionPublicApi = {
  addAction: (action: CustomAction, savedCommonContext?: CommonContext) => void
}

// eslint-disable-next-line local-rules/disallow-side-effects, import/no-default-export
export default function actionPlugin(): RumPlugin {
  let actionContexts: ActionContexts
  let addAction: ActionPublicApi['addAction']

  return {
    name: 'action',
    onStart(
      lifeCycle: LifeCycle,
      configuration: RumConfiguration,
      domMutationObservable: Observable<void>,
      pageStateHistory: PageStateHistory
    ) {
      ;({ actionContexts, addAction } = startActionCollection(
        lifeCycle,
        domMutationObservable,
        configuration,
        pageStateHistory
      ))
    },
    onEvent({ startTime, rumEvent }) {
      const actionId = actionContexts.findActionId(startTime)
      if (needToAssembleWithAction(rumEvent) && actionId) {
        ;(rumEvent.action as Mutable<RumEvent['action']>) = { id: actionId }
      }
    },
    onTelemetryEvent({ telemetryEvent }) {
      const actionId = actionContexts.findActionId()
      if (actionId) {
        telemetryEvent.action = {
          id: actionId as string,
        }
      }
    },
    getInternalContext({ startTime }) {
      const actionId = actionContexts.findActionId(startTime)
      if (actionId) {
        return { user_action: { id: actionId } }
      }
      return {}
    },
    getApi(): ActionPublicApi {
      return { addAction }
    },
    // could be removed in favor of onTelemetryEvent
    getConfigurationTelemetry() {
      return {}
    },
  } satisfies RumPlugin
}

function needToAssembleWithAction(event: RumEvent): event is RumErrorEvent | RumResourceEvent | RumLongTaskEvent {
  return [RumEventType.ERROR, RumEventType.RESOURCE, RumEventType.LONG_TASK].indexOf(event.type as RumEventType) !== -1
}
