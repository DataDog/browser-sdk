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
        timestamp,
        type: RecordType.Meta,
        data: {
          width,
          height,
          href: window.location.href,
        },
      },
      {
        timestamp,
        type: RecordType.Focus,
        data: {
          has_focus: document.hasFocus(),
        },
      },
      {
        timestamp,
        type: RecordType.FullSnapshot,
        data: {
          node: serializeDocument(document, configuration, serializationContext),
          initialOffset: {
            top: getScrollY(),
            left: getScrollX(),
          },
        },
      },
    ]

    if (window.visualViewport) {
      records.push({
        timestamp,
        type: RecordType.VisualViewport,
        data: getVisualViewport(window.visualViewport),
      })
    }
    return records
  }

  fullSnapshotCallback(takeFullSnapshot())

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    flushMutations()
    fullSnapshotCallback(
      takeFullSnapshot(view.startClocks.timeStamp, {
        status: SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT,
        elementsScrollPositions,
        shadowRootsController,
      })
    )
  })

  return {
    stop: unsubscribe,
  }
}
