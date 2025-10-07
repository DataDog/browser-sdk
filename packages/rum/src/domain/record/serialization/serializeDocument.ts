import { elapsed, timeStampNow } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { SerializedNodeWithId } from '../../../types'
import type { SerializationContext } from './serialization.types'
import { serializeNodeWithId } from './serializeNode'
import type { SerializationScope } from './serializationScope'
import { updateSerializationStats } from './serializationStats'

export function serializeDocument(
  document: Document,
  configuration: RumConfiguration,
  scope: SerializationScope,
  serializationContext: SerializationContext
): SerializedNodeWithId {
  const serializationStart = timeStampNow()
  const serializedNode = serializeNodeWithId(document, configuration.defaultPrivacyLevel, {
    serializationContext,
    configuration,
    scope,
  })
  updateSerializationStats(
    serializationContext.serializationStats,
    'serializationDuration',
    elapsed(serializationStart, timeStampNow())
  )

  // We are sure that Documents are never ignored, so this function never returns null
  return serializedNode!
}
