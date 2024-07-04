import { LifeCycleEventType, getScrollX, getScrollY, getViewportDimension } from '@datadog/browser-rum-core'
import type { RumConfiguration, LifeCycle } from '@datadog/browser-rum-core'
import { timeStampNow } from '@datadog/browser-core'
import type { BrowserRecord } from '../../types'
import { RecordType } from '../../types'
import type { ElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'
import { SerializationContextStatus, serializeDocument } from './serialization'
import { getVisualViewport } from './viewports'

export function startFullSnapshots(
  elementsScrollPositions: ElementsScrollPositions,
  shadowRootsController: ShadowRootsController,
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  flushMutations: () => void,
  fullSnapshotCallback: (records: BrowserRecord[]) => void
) {
  const takeFullSnapshot = (
    timestamp = timeStampNow(),
    serializationContext = {
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions,
      shadowRootsController,
    }
  ) => {
    const { width, height } = getViewportDimension()
    const records: BrowserRecord[] = [
      {
        data: {
          height,
          href: window.location.href,
          width,
        },
        type: RecordType.Meta,
        timestamp,
      },
      {
        data: {
          has_focus: document.hasFocus(),
        },
        type: RecordType.Focus,
        timestamp,
      },
      {
        data: {
          node: serializeDocument(document, configuration, serializationContext),
          initialOffset: {
            left: getScrollX(),
            top: getScrollY(),
          },
        },
        type: RecordType.FullSnapshot,
        timestamp,
      },
    ]

    if (window.visualViewport) {
      records.push({
        data: getVisualViewport(window.visualViewport),
        type: RecordType.VisualViewport,
        timestamp,
      })
    }
    return records
  }

  fullSnapshotCallback(takeFullSnapshot())

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    flushMutations()
    fullSnapshotCallback(
      takeFullSnapshot(view.startClocks.timeStamp, {
        shadowRootsController,
        status: SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT,
        elementsScrollPositions,
      })
    )
  })

  return {
    stop: unsubscribe,
  }
}
