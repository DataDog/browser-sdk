import { IConfigurationStore } from './configuration-store/configuration-store'
import { MemoryOnlyConfigurationStore } from './configuration-store/memory.store'
import { PrecomputedFlag } from './interfaces'

export function precomputedFlagsStorageFactory(): IConfigurationStore<PrecomputedFlag> {
  return new MemoryOnlyConfigurationStore()
}
