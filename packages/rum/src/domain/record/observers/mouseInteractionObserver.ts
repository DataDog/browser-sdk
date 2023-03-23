import type { DefaultPrivacyLevel } from '@datadog/browser-core'
import { assign, addEventListeners, DOM_EVENT } from '@datadog/browser-core'
import { NodePrivacyLevel } from '../../../constants'
import type { MouseInteraction, MouseInteractionData, BrowserIncrementalSnapshotRecord } from '../../../types'
import { IncrementalSource, MouseInteractionType } from '../../../types'
import { getNodePrivacyLevel } from '../privacy'
import { getSerializedNodeId, hasSerializedNode } from '../serialization'
import { assembleIncrementalSnapshot } from '../utils'
import { tryToComputeCoordinates } from './moveObserver'
import type { ListenerHandler } from './utils'
import { getRecordIdForEvent, getEventTarget } from './utils'

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

export type MouseInteractionCallBack = (record: BrowserIncrementalSnapshotRecord) => void

export function initMouseInteractionObserver(
  cb: MouseInteractionCallBack,
  defaultPrivacyLevel: DefaultPrivacyLevel
): ListenerHandler {
  const handler = (event: MouseEvent | TouchEvent) => {
    const target = getEventTarget(event)
    if (getNodePrivacyLevel(target, defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN || !hasSerializedNode(target)) {
      return
    }
    const id = getSerializedNodeId(target)
    const type = eventTypeToMouseInteraction[event.type as keyof typeof eventTypeToMouseInteraction]

    let interaction: MouseInteraction
    if (type !== MouseInteractionType.Blur && type !== MouseInteractionType.Focus) {
      const coordinates = tryToComputeCoordinates(event)
      if (!coordinates) {
        return
      }
      interaction = { id, type, x: coordinates.x, y: coordinates.y }
    } else {
      interaction = { id, type }
    }

    const record = assign(
      { id: getRecordIdForEvent(event) },
      assembleIncrementalSnapshot<MouseInteractionData>(IncrementalSource.MouseInteraction, interaction)
    )
    cb(record)
  }
  return addEventListeners(document, Object.keys(eventTypeToMouseInteraction) as DOM_EVENT[], handler, {
    capture: true,
    passive: true,
  }).stop
}
