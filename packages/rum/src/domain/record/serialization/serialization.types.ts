import type { RumConfiguration, NodePrivacyLevel } from '@datadog/browser-rum-core'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import type { ShadowRootsController } from '../shadowRootsController'

// Those values are the only one that can be used when inheriting privacy levels from parent to
// children during serialization, since HIDDEN and IGNORE shouldn't serialize their children. This
// ensures that no children are serialized when they shouldn't.
type ParentNodePrivacyLevel =
  | typeof NodePrivacyLevel.ALLOW
  | typeof NodePrivacyLevel.MASK
  | typeof NodePrivacyLevel.MASK_USER_INPUT

export const SerializationContextStatus = {
  INITIAL_FULL_SNAPSHOT: 0,
  SUBSEQUENT_FULL_SNAPSHOT: 1,
  MUTATION: 2,
} as const
export type SerializationContextStatusEnum = (typeof SerializationContextStatus)[keyof typeof SerializationContextStatus]

export type SerializationContext =
  | {
      status: typeof SerializationContextStatus.MUTATION
      shadowRootsController: ShadowRootsController
    }
  | {
      status: typeof SerializationContextStatus.INITIAL_FULL_SNAPSHOT
      elementsScrollPositions: ElementsScrollPositions
      shadowRootsController: ShadowRootsController
    }
  | {
      status: typeof SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT
      elementsScrollPositions: ElementsScrollPositions
      shadowRootsController: ShadowRootsController
    }

export interface SerializeOptions {
  serializedNodeIds?: Set<number>
  ignoreWhiteSpace?: boolean
  parentNodePrivacyLevel: ParentNodePrivacyLevel
  serializationContext: SerializationContext
  configuration: RumConfiguration
}

export type NodeWithSerializedNode = Node & { s: 'Node with serialized node' }
