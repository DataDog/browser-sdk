import { assign, addEventListeners, DOM_EVENT } from '@datadog/browser-core'
import { getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { MouseInteraction, MouseInteractionData, BrowserIncrementalSnapshotRecord } from '../../../types'
import { IncrementalSource, MouseInteractionType } from '../../../types'
import { assembleIncrementalSnapshot } from '../assembly'
import { getEventTarget } from '../eventsUtils'
import { getSerializedNodeId, hasSerializedNode } from '../serialization'
import type { RecordIds } from '../recordIds'
import { tryToComputeCoordinates } from './trackMove'
import type { Tracker } from './types'

const eventTypeToMouseInteraction = {
  // Listen for pointerup DOM events instead of mouseup for MouseInteraction/MouseUp records. This
  // allows to reference such records from Frustration records.
  //
  // In the context of supporting Mobile Session Replay, we introduced `PointerInteraction` records
  // used by the Mobile SDKs in place of `MouseInteraction`. In the future, we should replace
  // `MouseInteraction` by `PointerInteraction` in the Browser SDK so we have an uniform way to
  // convey such interaction. This would cleanly solve the issue since we would have
  // `PointerInteraction/Up` records that we could reference from `Frustration` records.
  [DOM_EVENT.POINTER_UP]: MouseInteractionType.MouseUp,

  [DOM_EVENT.MOUSE_DOWN]: MouseInteractionType.MouseDown,
  [DOM_EVENT.CLICK]: MouseInteractionType.Click,
  [DOM_EVENT.CONTEXT_MENU]: MouseInteractionType.ContextMenu,
  [DOM_EVENT.DBL_CLICK]: MouseInteractionType.DblClick,
  [DOM_EVENT.FOCUS]: MouseInteractionType.Focus,
  [DOM_EVENT.BLUR]: MouseInteractionType.Blur,
  [DOM_EVENT.TOUCH_START]: MouseInteractionType.TouchStart,
  [DOM_EVENT.TOUCH_END]: MouseInteractionType.TouchEnd,
}

export type MouseInteractionCallback = (record: BrowserIncrementalSnapshotRecord) => void

export function trackMouseInteraction(
  configuration: RumConfiguration,
  mouseInteractionCb: MouseInteractionCallback,
  recordIds: RecordIds
): Tracker {
  const handler = (event: MouseEvent | TouchEvent | FocusEvent) => {
    const target = getEventTarget(event)
    if (
      getNodePrivacyLevel(target, configuration.defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN ||
      !hasSerializedNode(target)
    ) {
      return
    }
    const id = getSerializedNodeId(target)
    const type = eventTypeToMouseInteraction[event.type as keyof typeof eventTypeToMouseInteraction]

    let interaction: MouseInteraction
    if (type !== MouseInteractionType.Blur && type !== MouseInteractionType.Focus) {
      const coordinates = tryToComputeCoordinates(event as MouseEvent | TouchEvent)
      if (!coordinates) {
        return
      }
      interaction = { id, type, x: coordinates.x, y: coordinates.y }
    } else {
      interaction = { id, type }
    }

    const record = assign(
      { id: recordIds.getIdForEvent(event) },
      assembleIncrementalSnapshot<MouseInteractionData>(IncrementalSource.MouseInteraction, interaction)
    )
    mouseInteractionCb(record)
  }
  return addEventListeners(
    configuration,
    document,
    Object.keys(eventTypeToMouseInteraction) as Array<keyof typeof eventTypeToMouseInteraction>,
    handler,
    {
      capture: true,
      passive: true,
    }
  )
}
