import { LifeCycleEventType, getScrollX, getScrollY, getViewportDimension } from '@datadog/browser-rum-core'
import type { RumConfiguration, LifeCycle } from '@datadog/browser-rum-core'
import { timeStampNow } from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import type { BrowserRecord } from '../../types'
import { RecordType } from '../../types'
import type { ElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'
import type { SerializationContext, SerializationScope, SerializationStats } from './serialization'
import { createSerializationStats, SerializationContextStatus, serializeDocument } from './serialization'
import { getVisualViewport } from './viewports'

export function startFullSnapshots(
  elementsScrollPositions: ElementsScrollPositions,
  shadowRootsController: ShadowRootsController,
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  scope: SerializationScope,
  flushMutations: () => void,
  emit: (record: BrowserRecord, stats?: SerializationStats) => void
) {
  const takeFullSnapshot = (timestamp: TimeStamp, status: SerializationContextStatus) => {
    const { width, height } = getViewportDimension()
    emit({
      data: {
        height,
        href: window.location.href,
        width,
      },
      type: RecordType.Meta,
      timestamp,
    })
    emit({
      data: {
        has_focus: document.hasFocus(),
      },
      type: RecordType.Focus,
      timestamp,
    })

    const serializationStats = createSerializationStats()
    const serializationContext: SerializationContext = {
      status,
      elementsScrollPositions,
      serializationStats,
      shadowRootsController,
    }
    emit(
      {
        data: {
          node: serializeDocument(document, configuration, scope, serializationContext),
          initialOffset: {
            left: getScrollX(),
            top: getScrollY(),
          },
        },
        type: RecordType.FullSnapshot,
        timestamp,
      },
      serializationStats
    )

    if (window.visualViewport) {
      emit({
        data: getVisualViewport(window.visualViewport),
        type: RecordType.VisualViewport,
        timestamp,
      })
    }
  }

  takeFullSnapshot(timeStampNow(), SerializationContextStatus.INITIAL_FULL_SNAPSHOT)

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    flushMutations()
    takeFullSnapshot(view.startClocks.timeStamp, SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT)
  })

  return {
    stop: unsubscribe,
  }
}
