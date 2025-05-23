import type { ISyncStore } from './configuration-store/configurationStore'
import { createMemoryStore } from './configuration-store/memoryStore'
import type { PrecomputedFlag } from './interfaces'

export function precomputedFlagsStorageFactory(): ISyncStore<PrecomputedFlag> {
  return createMemoryStore()
}
