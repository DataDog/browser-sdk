import { LifeCycleEventType, getScrollX, getScrollY, getViewportDimension } from '@datadog/browser-rum-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { timeStampNow } from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import type { BrowserRecord } from '../../types'
import { RecordType } from '../../types'
import type { SerializationScope } from './serialization'
import { MutationKind, serializeDocument } from './serialization'
import { getVisualViewport } from './viewports'

export function startFullSnapshots(lifeCycle: LifeCycle, scope: SerializationScope, flushMutations: () => void) {
  const takeFullSnapshot = (timestamp: TimeStamp, mutationKind: MutationKind) => {
    scope.captureMutation(mutationKind, (transaction) => {
      const records: BrowserRecord[] = []

      const { width, height } = getViewportDimension()
      records.push({
        data: {
          height,
          href: window.location.href,
          width,
        },
        type: RecordType.Meta,
        timestamp,
      })

      records.push({
        data: {
          has_focus: document.hasFocus(),
        },
        type: RecordType.Focus,
        timestamp,
      })

      records.push({
        data: {
          node: serializeDocument(document, transaction),
          initialOffset: {
            left: getScrollX(),
            top: getScrollY(),
          },
        },
        type: RecordType.FullSnapshot,
        timestamp,
      })

      if (window.visualViewport) {
        records.push({
          data: getVisualViewport(window.visualViewport),
          type: RecordType.VisualViewport,
          timestamp,
        })
      }

      return records
    })
  }

  takeFullSnapshot(timeStampNow(), MutationKind.INITIAL_FULL_SNAPSHOT)

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    flushMutations()
    takeFullSnapshot(view.startClocks.timeStamp, MutationKind.SUBSEQUENT_FULL_SNAPSHOT)
  })

  return {
    stop: unsubscribe,
  }
}
