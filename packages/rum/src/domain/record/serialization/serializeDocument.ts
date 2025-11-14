import type { SerializedNodeWithId } from '../../../types'
import { serializeNodeWithId } from './serializeNode'
import type { MutationTransaction } from './serializationScope'

export function serializeDocument(document: Document, transaction: MutationTransaction): SerializedNodeWithId {
  const defaultPrivacyLevel = transaction.scope.configuration.defaultPrivacyLevel
  const serializedNode = serializeNodeWithId(document, defaultPrivacyLevel, transaction)

  // We are sure that Documents are never ignored, so this function never returns null
  return serializedNode!
}
