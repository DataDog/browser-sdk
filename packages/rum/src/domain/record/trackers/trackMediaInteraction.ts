import { DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import { NodePrivacyLevel, getNodePrivacyLevel } from '@datadog/browser-rum-core'
import type { MediaInteractionData } from '../../../types'
import { IncrementalSource, MediaInteractionType } from '../../../types'
import { getEventTarget } from '../eventsUtils'
import { assembleIncrementalSnapshot } from '../assembly'
import type { SerializationScope } from '../serialization'
import type { Tracker } from './tracker.types'

export function trackMediaInteraction(scope: SerializationScope): Tracker {
  return addEventListeners(
    scope.configuration,
    document,
    [DOM_EVENT.PLAY, DOM_EVENT.PAUSE],
    (event) => {
      scope.captureEvent(() => {
        const target = getEventTarget(event)
        if (!target) {
          return
        }
        const id = scope.nodeIds.get(target)
        if (
          id === undefined ||
          getNodePrivacyLevel(target, scope.configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN
        ) {
          return
        }
        return assembleIncrementalSnapshot<MediaInteractionData>(IncrementalSource.MediaInteraction, {
          id,
          type: event.type === DOM_EVENT.PLAY ? MediaInteractionType.Play : MediaInteractionType.Pause,
        })
      })
    },
    {
      capture: true,
      passive: true,
    }
  )
}
