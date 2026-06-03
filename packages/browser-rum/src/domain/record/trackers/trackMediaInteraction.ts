import { DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import { NodePrivacyLevel, getNodePrivacyLevel } from '@datadog/browser-rum-core'
import type { MediaInteractionData, BrowserIncrementalSnapshotRecord } from '../../../types'
import { IncrementalSource, MediaInteractionType } from '../../../types'
import { getEventTarget } from '../eventsUtils'
import { assembleIncrementalSnapshot } from '../assembly'
import type { EmitRecordCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import type { Tracker } from './tracker.types'

export function trackMediaInteraction(
  emitRecord: EmitRecordCallback<BrowserIncrementalSnapshotRecord>,
  scope: RecordingScope
): Tracker {
  return addEventListeners(
    scope.configuration,
    document,
    [DOM_EVENT.PLAY, DOM_EVENT.PAUSE],
    (event) => {
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
      emitRecord(
        assembleIncrementalSnapshot<MediaInteractionData>(IncrementalSource.MediaInteraction, {
          id,
          type: event.type === DOM_EVENT.PLAY ? MediaInteractionType.Play : MediaInteractionType.Pause,
        })
      )
    },
    {
      capture: true,
      passive: true,
    }
  )
}
