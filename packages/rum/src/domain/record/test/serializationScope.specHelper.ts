import { noop } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { createEventIds } from '../eventIds'
import { createNodeIds } from '../nodeIds'
import type { EmitRecordCallback, SerializationScope } from '../serialization'
import { createSerializationScope } from '../serialization'
import type { ShadowRootsController } from '../shadowRootsController'
import { DEFAULT_CONFIGURATION } from './rumConfiguration.specHelper'
import { DEFAULT_SHADOW_ROOT_CONTROLLER } from './shadowRootsController.specHelper'

export function createSerializationScopeForTesting({
  configuration,
  emitRecord,
  shadowRootsController,
}: {
  configuration?: Partial<RumConfiguration>
  emitRecord?: EmitRecordCallback
  shadowRootsController?: ShadowRootsController
} = {}): SerializationScope {
  return createSerializationScope(
    (configuration as RumConfiguration) || DEFAULT_CONFIGURATION,
    createElementsScrollPositions(),
    emitRecord || noop,
    createEventIds(),
    createNodeIds(),
    shadowRootsController || DEFAULT_SHADOW_ROOT_CONTROLLER
  )
}
