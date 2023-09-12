import type { DefaultPrivacyLevel, ListenerHandler } from '@datadog/browser-core'
import { DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { NodePrivacyLevel } from '../../../constants'
import type { MediaInteraction } from '../../../types'
import { MediaInteractionType } from '../../../types'
import { getEventTarget } from '../eventsUtils'
import { getNodePrivacyLevel } from '../privacy'
import { getSerializedNodeId, hasSerializedNode } from '../serialization'

export type MediaInteractionCallback = (p: MediaInteraction) => void

export function initMediaInteractionObserver(
  configuration: RumConfiguration,
  mediaInteractionCb: MediaInteractionCallback,
  defaultPrivacyLevel: DefaultPrivacyLevel
): ListenerHandler {
  return addEventListeners(
    configuration,
    document,
    [DOM_EVENT.PLAY, DOM_EVENT.PAUSE],
    (event) => {
      const target = getEventTarget(event)
      if (
        !target ||
        getNodePrivacyLevel(target, defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN ||
        !hasSerializedNode(target)
      ) {
        return
      }
      mediaInteractionCb({
        id: getSerializedNodeId(target),
        type: event.type === DOM_EVENT.PLAY ? MediaInteractionType.Play : MediaInteractionType.Pause,
      })
    },
    {
      capture: true,
      passive: true,
    }
  ).stop
}
