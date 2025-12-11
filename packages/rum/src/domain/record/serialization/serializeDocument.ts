import type { DocumentNode, SerializedNodeWithId } from '../../../types'
import { serializeNodeWithId } from './serializeNode'
import type { SerializationTransaction } from './serializationTransaction'

export function serializeDocument(
  document: Document,
  transaction: SerializationTransaction
): DocumentNode & SerializedNodeWithId {
  const defaultPrivacyLevel = transaction.scope.configuration.defaultPrivacyLevel
  const serializedNode = serializeNodeWithId(document, defaultPrivacyLevel, transaction)

  // We are sure that Documents are never ignored, so this function never returns null
  return serializedNode as DocumentNode & SerializedNodeWithId
}
