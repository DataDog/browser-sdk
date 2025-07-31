export {
  getElementInputValue,
  getSerializedNodeId,
  hasSerializedNode,
  nodeAndAncestorsHaveSerializedNode,
} from './serializationUtils'
export type { NodeWithSerializedNode } from './serialization.types'
export { SerializationContextStatus } from './serialization.types'
export type { SerializationContext } from './serialization.types'
export { serializeDocument } from './serializeDocument'
export { serializeNodeWithId } from './serializeNode'
export { serializeAttribute } from './serializeAttribute'
export {
  createSerializationStats,
  updateCssTextSerializationStats,
  aggregateSerializationStats,
} from './serializationStats'
export type { SerializationMetric, SerializationStats } from './serializationStats'
