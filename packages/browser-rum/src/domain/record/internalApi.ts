import { noop } from '@openobserve/browser-core'
import { timeStampNow } from '@openobserve/js-core/time'
import type { RumConfiguration } from '@openobserve/browser-rum-core'
import { getNodePrivacyLevel, NodePrivacyLevel } from '@openobserve/browser-rum-core'
import type { BrowserRecord } from '../../types'
import { takeFullSnapshot as doTakeFullSnapshot } from './startFullSnapshots'
import type { RecordingScope } from './recordingScope'
import { createRecordingScope } from './recordingScope'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { EmitRecordCallback } from './record.types'
import type { SerializationTransaction } from './serialization'
import { createRootInsertionCursor, SerializationKind, serializeInTransaction, serializeNode } from './serialization'

/**
 * Take a full snapshot of the document, generating the same records that the browser SDK
 * would generate.
 *
 * This is an internal API function. Be sure to update Datadog-internal callers if you
 * change its signature or behavior.
 */
export function takeFullSnapshot({
  configuration,
}: { configuration?: Partial<RumConfiguration> } = {}): BrowserRecord[] {
  const records: BrowserRecord[] = []
  const emitRecord: EmitRecordCallback = (record: BrowserRecord) => {
    records.push(record)
  }

  doTakeFullSnapshot(
    timeStampNow(),
    SerializationKind.INITIAL_FULL_SNAPSHOT,
    emitRecord,
    noop,
    createTemporaryRecordingScope(configuration)
  )

  return records
}

/**
 * Take a snapshot of a DOM node, generating the serialized representation that the
 * browser SDK would generate.
 *
 * This is an internal API function. Be sure to update Datadog-internal callers if you
 * change its signature or behavior.
 */
export function takeNodeSnapshot(
  node: Node,
  { configuration }: { configuration?: Partial<RumConfiguration> } = {}
): BrowserRecord | undefined {
  let nodeSnapshotRecord: BrowserRecord | undefined
  const emitRecord = (record: BrowserRecord) => {
    nodeSnapshotRecord = record
  }

  serializeInTransaction(
    SerializationKind.INITIAL_FULL_SNAPSHOT,
    emitRecord,
    noop,
    createTemporaryRecordingScope(configuration),
    timeStampNow(),
    (transaction: SerializationTransaction): void => {
      const privacyLevel = getNodePrivacyLevel(node, transaction.scope.configuration.defaultPrivacyLevel)
      if (privacyLevel === NodePrivacyLevel.HIDDEN || privacyLevel === NodePrivacyLevel.IGNORE) {
        return
      }
      const cursor = createRootInsertionCursor(transaction.scope.nodeIds)
      serializeNode(cursor, node, privacyLevel, transaction)
    }
  )

  return nodeSnapshotRecord
}

function createTemporaryRecordingScope(configuration?: Partial<RumConfiguration>): RecordingScope {
  return createRecordingScope(
    {
      defaultPrivacyLevel: NodePrivacyLevel.ALLOW,
      ...configuration,
    } as RumConfiguration,
    createElementsScrollPositions(),
    {
      addShadowRoot: noop,
      removeShadowRoot: noop,
      flush: noop,
      stop: noop,
    }
  )
}
