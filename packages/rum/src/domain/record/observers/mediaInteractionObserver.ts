import type { DefaultPrivacyLevel } from '@datadog/browser-core'
import { DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import { NodePrivacyLevel } from '../../../constants'
import type { MediaInteraction } from '../../../types'
import { MediaInteractionType } from '../../../types'
import { getNodePrivacyLevel } from '../privacy'
import { getSerializedNodeId, hasSerializedNode } from '../serializationUtils'
import type { ListenerHandler } from './utils'
import { getEventTarget } from './utils'

export type MediaInteractionCallback = (p: MediaInteraction) => void

export function initMediaInteractionObserver(
  mediaInteractionCb: MediaInteractionCallback,
  defaultPrivacyLevel: DefaultPrivacyLevel
): ListenerHandler {
  const handler = (event: Event) => {
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
  }
  return addEventListeners(document, [DOM_EVENT.PLAY, DOM_EVENT.PAUSE], handler, { capture: true, passive: true }).stop
}
