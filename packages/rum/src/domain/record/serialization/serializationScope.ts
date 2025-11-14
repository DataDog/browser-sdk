import { elapsed, timeStampNow } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'

import type { BrowserRecord } from '../../../types'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import type { EventIds } from '../eventIds'
import type { NodeId, NodeIds } from '../nodeIds'
import type { ShadowRootsController } from '../shadowRootsController'
import type { SerializationStats } from './serializationStats'
import { createSerializationStats, updateSerializationStats } from './serializationStats'

export type CaptureInteractionCallback = () => BrowserRecord | undefined
export type CaptureMutationCallback = (transaction: MutationTransaction) => BrowserRecord[]
export type EmitRecordCallback = (record: BrowserRecord, stats?: SerializationStats) => void

export interface SerializationScope {
  captureEvent(callback: CaptureInteractionCallback): void
  captureMutation(kind: MutationKind, callback: CaptureMutationCallback): void
  configuration: RumConfiguration
  elementsScrollPositions: ElementsScrollPositions
  eventIds: EventIds
  nodeIds: NodeIds
  shadowRootsController: ShadowRootsController
}

export const enum MutationKind {
  INITIAL_FULL_SNAPSHOT,
  SUBSEQUENT_FULL_SNAPSHOT,
  INCREMENTAL,
}

export interface MutationTransaction {
  kind: MutationKind
  serializedNodeIds?: Set<NodeId>
  scope: SerializationScope
  stats: SerializationStats
}

export function createSerializationScope(
  configuration: RumConfiguration,
  elementsScrollPositions: ElementsScrollPositions,
  emitRecord: EmitRecordCallback,
  eventIds: EventIds,
  nodeIds: NodeIds,
  shadowRootsController: ShadowRootsController
): SerializationScope {
  const captureEvent = (callback: CaptureInteractionCallback): void => {
    const record = callback()
    if (record) {
      emitRecord(record)
    }
  }

  const captureMutation = (kind: MutationKind, callback: CaptureMutationCallback): void => {
    const transaction: MutationTransaction = {
      kind,
      scope,
      stats: createSerializationStats(),
    }

    const start = timeStampNow()
    const records = callback(transaction)
    updateSerializationStats(transaction.stats, 'serializationDuration', elapsed(start, timeStampNow()))

    for (const record of records) {
      emitRecord(record, transaction.stats)
    }
  }

  const scope = {
    captureEvent,
    captureMutation,
    configuration,
    elementsScrollPositions,
    eventIds,
    nodeIds,
    shadowRootsController,
  }
  return scope
}
