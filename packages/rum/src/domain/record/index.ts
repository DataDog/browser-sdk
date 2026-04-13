export { takeFullSnapshot, takeNodeSnapshot } from './internalApi'
export { record } from './record'
export type { ChangeDecoder, SerializationMetric, SerializationStats } from './serialization'
export {
  aggregateSerializationStats,
  createChangeDecoder,
  createSerializationStats,
  isFullSnapshotChangeRecordsEnabled,
  isIncrementalSnapshotChangeRecordsEnabled,
  serializeNode,
} from './serialization'
export { createElementsScrollPositions } from './elementsScrollPositions'
export type { ShadowRootsController } from './shadowRootsController'
