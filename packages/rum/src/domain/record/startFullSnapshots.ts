import { LifeCycleEventType, getScrollX, getScrollY, getViewportDimension } from '@datadog/browser-rum-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import {
  addTelemetryError,
  buildUrl,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
  noop,
  timeStampNow,
} from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import type { BrowserChangeRecord, BrowserFullSnapshotRecord, BrowserRecord } from '../../types'
import { RecordType } from '../../types'
import type { ChangeSerializationTransaction, SerializationTransaction } from './serialization'
import {
  createRootInsertionCursor,
  serializeChangesInTransaction,
  serializeDocument,
  serializeInTransaction,
  serializeNodeAsChange,
  SerializationKind,
  convertChangeToFullSnapshot,
} from './serialization'
import { getVisualViewport } from './viewports'
import { createRecordingScope } from './recordingScope'
import type { RecordingScope } from './recordingScope'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'

export function startFullSnapshots(
  lifeCycle: LifeCycle,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  flushMutations: () => void,
  scope: RecordingScope
) {
  takeFullSnapshot(timeStampNow(), SerializationKind.INITIAL_FULL_SNAPSHOT, emitRecord, emitStats, scope)

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    flushMutations()
    takeFullSnapshot(
      view.startClocks.timeStamp,
      SerializationKind.SUBSEQUENT_FULL_SNAPSHOT,
      emitRecord,
      emitStats,
      scope
    )
  })

  return {
    stop: unsubscribe,
  }
}

export function takeFullSnapshot(
  timestamp: TimeStamp,
  kind: SerializationKind,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope
): void {
  const { width, height } = getViewportDimension()
  emitRecord({
    data: {
      height,
      href: window.location.href,
      width,
    },
    type: RecordType.Meta,
    timestamp,
  })

  emitRecord({
    data: {
      has_focus: document.hasFocus(),
    },
    type: RecordType.Focus,
    timestamp,
  })

  if (isExperimentalFeatureEnabled(ExperimentalFeature.USE_CHANGE_RECORDS)) {
    if (kind === SerializationKind.SUBSEQUENT_FULL_SNAPSHOT) {
      scope.resetIds()
    }
    serializeChangesInTransaction(
      kind,
      emitRecord,
      emitStats,
      scope,
      timestamp,
      (transaction: ChangeSerializationTransaction) => {
        serializeNodeAsChange(
          createRootInsertionCursor(scope.nodeIds),
          document,
          scope.configuration.defaultPrivacyLevel,
          transaction
        )
      }
    )
  } else {
    scope.resetIds()
    serializeInTransaction(kind, emitRecord, emitStats, scope, (transaction: SerializationTransaction) => {
      const fullSnapshot = serializeFullSnapshotRecord(timestamp, transaction)

      const changeScope = createRecordingScope(scope.configuration, scope.elementsScrollPositions, {
        addShadowRoot: noop,
        flush: noop,
        removeShadowRoot: noop,
        stop: noop,
      })

      let changeRecord: BrowserChangeRecord | undefined
      serializeChangesInTransaction(
        transaction.kind,
        (record: BrowserRecord): void => {
          if (record.type !== RecordType.Change) {
            throw new Error(`Received unexpected record type: ${record.type}`)
          }
          changeRecord = record
        },
        noop,
        changeScope,
        timestamp,
        (transaction: ChangeSerializationTransaction) => {
          const cursor = createRootInsertionCursor(changeScope.nodeIds)
          serializeNodeAsChange(cursor, document, scope.configuration.defaultPrivacyLevel, transaction)
        }
      )

      const changeRecordAsFullSnapshot = convertChangeToFullSnapshot(changeRecord!)
      const expected = JSON.stringify(fullSnapshot.data)
      const actual = JSON.stringify(changeRecordAsFullSnapshot.data)
      const changeRecordMatchesByteForByte = expected === actual
      if (!changeRecordMatchesByteForByte) {
        addTelemetryError(
          new Error('BrowserChangeRecord does not match BrowserFullSnapshotRecord'),
          createSerializationMismatchContext(expected, actual)
        )
      }

      transaction.add(fullSnapshot)
    })
  }

  if (window.visualViewport) {
    emitRecord({
      data: getVisualViewport(window.visualViewport),
      type: RecordType.VisualViewport,
      timestamp,
    })
  }
}

function serializeFullSnapshotRecord(
  timestamp: TimeStamp,
  transaction: SerializationTransaction
): BrowserFullSnapshotRecord {
  return {
    data: {
      node: serializeDocument(document, transaction),
      initialOffset: {
        left: getScrollX(),
        top: getScrollY(),
      },
    },
    type: RecordType.FullSnapshot,
    timestamp,
  }
}

function createSerializationMismatchContext(expected: string, actual: string): Record<string, string> {
  const url = buildUrl(document.location.href)
  url.search = ''

  try {
    let firstDifferenceIndex = 0
    while (expected[firstDifferenceIndex] === actual[firstDifferenceIndex]) {
      firstDifferenceIndex++
    }
    return {
      expected: getStringNearPosition(expected, firstDifferenceIndex),
      actual: getStringNearPosition(actual, firstDifferenceIndex),
      url: url.href,
    }
  } catch (e) {
    return { firstDifferenceError: JSON.stringify(e), url: url.href }
  }
}

function getStringNearPosition(str: string, index: number): string {
  const leftContextStart = Math.max(index - 20, 0)
  const rightContextEnd = Math.min(index + 100, str.length)
  return `${str.substring(leftContextStart, index)}(!)${str.substring(index, rightContextEnd)}`
}
