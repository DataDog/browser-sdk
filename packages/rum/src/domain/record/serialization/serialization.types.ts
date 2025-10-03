import type { RumConfiguration, NodePrivacyLevel } from '@datadog/browser-rum-core'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import type { ShadowRootsController } from '../shadowRootsController'
import type { SerializationScope } from './serializationScope'
import type { SerializationStats } from './serializationStats'

// Those values are the only one that can be used when inheriting privacy levels from parent to
// children during serialization, since HIDDEN and IGNORE shouldn't serialize their children. This
// ensures that no children are serialized when they shouldn't.
export type ParentNodePrivacyLevel =
  | typeof NodePrivacyLevel.ALLOW
  | typeof NodePrivacyLevel.MASK
  | typeof NodePrivacyLevel.MASK_USER_INPUT
  | typeof NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED

export const enum SerializationContextStatus {
  INITIAL_FULL_SNAPSHOT,
  SUBSEQUENT_FULL_SNAPSHOT,
  MUTATION,
}

export type SerializationContext =
  | {
      status: SerializationContextStatus.MUTATION
      serializationStats: SerializationStats
      shadowRootsController: ShadowRootsController
    }
  | {
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT
      elementsScrollPositions: ElementsScrollPositions
      serializationStats: SerializationStats
      shadowRootsController: ShadowRootsController
    }
  | {
      status: SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT
      elementsScrollPositions: ElementsScrollPositions
      serializationStats: SerializationStats
      shadowRootsController: ShadowRootsController
    }

export interface SerializeOptions {
  serializedNodeIds?: Set<number>
  serializationContext: SerializationContext
  configuration: RumConfiguration
  scope: SerializationScope
}
