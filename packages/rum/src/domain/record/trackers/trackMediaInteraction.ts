import { DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { NodePrivacyLevel } from '../../../constants'
import type { BrowserIncrementalSnapshotRecord, MediaInteractionData } from '../../../types'
import { IncrementalSource, MediaInteractionType } from '../../../types'
import { getEventTarget } from '../eventsUtils'
import { getNodePrivacyLevel } from '../privacy'
import { getSerializedNodeId, hasSerializedNode } from '../serialization'
import { assembleIncrementalSnapshot } from '../assembly'
import type { Tracker } from './types'

export type MediaInteractionCallback = (incrementalSnapshotRecord: BrowserIncrementalSnapshotRecord) => void

export function trackMediaInteraction(
  configuration: RumConfiguration,
  mediaInteractionCb: MediaInteractionCallback
): Tracker {
  return addEventListeners(
    configuration,
    document,
    [DOM_EVENT.PLAY, DOM_EVENT.PAUSE],
    (event) => {
      const target = getEventTarget(event)
      if (
        !target ||
        getNodePrivacyLevel(target, configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN ||
        !hasSerializedNode(target)
      ) {
        return
      }
      mediaInteractionCb(
        assembleIncrementalSnapshot<MediaInteractionData>(IncrementalSource.MediaInteraction, {
          type: event.type === DOM_EVENT.PLAY ? MediaInteractionType.Play : MediaInteractionType.Pause,
          id: getSerializedNodeId(target),
        })
      )
    },
    {
      capture: true,
      passive: true,
    }
  )
}
