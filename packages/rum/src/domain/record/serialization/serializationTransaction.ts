import { elapsed, timeStampNow } from '@datadog/browser-core'

import type { BrowserRecord } from '../../../types'
import type { NodeId } from '../itemIds'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import type { SerializationStats } from './serializationStats'
import { createSerializationStats, updateSerializationStats } from './serializationStats'

export type SerializationTransactionCallback = (transaction: SerializationTransaction) => void

export const enum SerializationKind {
  INITIAL_FULL_SNAPSHOT,
  SUBSEQUENT_FULL_SNAPSHOT,
  INCREMENTAL_SNAPSHOT,
}

/**
 * A serialization transaction is used to build and emit a sequence of session replay
 * records containing a serialized snapshot of the DOM.
 */
export interface SerializationTransaction {
  /** Add a record to the transaction. It will be emitted when the transaction ends. */
  add(record: BrowserRecord): void

  /**
   * Add a metric to the transaction's statistics. The aggregated statistics will be
   * emitted when the transaction ends.
   */
  addMetric(metric: keyof SerializationStats, value: number): void

  /**
   * Assign and return an id to the given node. If the node has previously been assigned
   * an id, the existing id will be reused.
   */
  assignId(node: Node): NodeId

  /** The kind of serialization being performed in this transaction. */
  kind: SerializationKind

  /**
   * A set used to track nodes which have been serialized in the current transaction. If
   * undefined, this feature is disabled; this is the default state in new transactions
   * for performance reasons. Set the property to a non-undefined value if you need this
   * capability.
   */
  serializedNodeIds?: Set<NodeId>

  /** The recording scope in which this transaction is occurring. */
  scope: RecordingScope
}

/**
 * Perform serialization within a transaction. At the end of the transaction, the
 * generated records and statistics will be emitted.
 */
export function serializeInTransaction(
  kind: SerializationKind,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope,
  serialize: SerializationTransactionCallback
): void {
  const records: BrowserRecord[] = []
  const stats = createSerializationStats()

  const transaction: SerializationTransaction = {
    add(record: BrowserRecord): void {
      records.push(record)
    },
    addMetric(metric: keyof SerializationStats, value: number): void {
      updateSerializationStats(stats, metric, value)
    },
    assignId(node: Node): NodeId {
      const id = scope.nodeIds.getOrInsert(node)
      if (transaction.serializedNodeIds) {
        transaction.serializedNodeIds.add(id)
      }
      return id
    },
    kind,
    scope,
  }

  const start = timeStampNow()
  serialize(transaction)
  updateSerializationStats(stats, 'serializationDuration', elapsed(start, timeStampNow()))

  for (const record of records) {
    emitRecord(record)
  }

  emitStats(stats)
}
