import type { NodeIdRemapper } from './nodeIdRemapper'
import { createIdentityNodeIdRemapper } from './nodeIdRemapper'

export interface V1RenderOptions {
  nodeIdRemapper: NodeIdRemapper
  timestamp: number
}

export function createV1RenderOptions(options: Partial<V1RenderOptions> = {}): V1RenderOptions {
  return {
    nodeIdRemapper: options.nodeIdRemapper ?? createIdentityNodeIdRemapper(),
    timestamp: options.timestamp ?? 0,
  }
}
