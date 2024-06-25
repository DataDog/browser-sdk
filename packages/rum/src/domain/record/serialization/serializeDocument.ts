import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { SerializedNodeWithId } from '../../../types'
import type { SerializationContext, SerializedNodeCache } from './serialization.types'
import { serializeNodeWithId } from './serializeNode'

export function serializeDocument(
  document: Document,
  configuration: RumConfiguration,
  serializationContext: SerializationContext,
  cache?: SerializedNodeCache
): SerializedNodeWithId {
  // We are sure that Documents are never ignored, so this function never returns null
  return serializeNodeWithId(
    document,
    {
      serializationContext,
      parentNodePrivacyLevel: configuration.defaultPrivacyLevel,
      configuration,
    },
    cache
  )!
}
