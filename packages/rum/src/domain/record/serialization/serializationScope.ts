import type { NodeIds } from '../nodeIds'

export interface SerializationScope {
  nodeIds: NodeIds
}

export function createSerializationScope(nodeIds: NodeIds): SerializationScope {
  return { nodeIds }
}
