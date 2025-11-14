import { timeStampNow } from '@datadog/browser-core'
import { NodePrivacyLevel, getScrollX, getScrollY } from '@datadog/browser-rum-core'
import type { SerializationScope } from '../serialization'
import { MutationKind, serializeDocument, serializeNodeWithId } from '../serialization'
import type { ElementNode, SerializedNodeWithId } from '../../../types'
import { RecordType } from '../../../types'

export interface SerializeNodeForTestingOptions {
  kind?: MutationKind
}

export function serializeNodeForTesting(
  scope: SerializationScope,
  target: Element,
  options?: SerializeNodeForTestingOptions
): (ElementNode & SerializedNodeWithId) | null
export function serializeNodeForTesting(
  scope: SerializationScope,
  target: Node,
  options?: SerializeNodeForTestingOptions
): SerializedNodeWithId | null
export function serializeNodeForTesting(
  scope: SerializationScope,
  target: Node,
  options: SerializeNodeForTestingOptions = {}
): SerializedNodeWithId | null {
  let serializedNode: SerializedNodeWithId | null = null

  scope.captureMutation(options.kind || MutationKind.INITIAL_FULL_SNAPSHOT, (transaction) => {
    serializedNode = serializeNodeWithId(target, NodePrivacyLevel.ALLOW, transaction)
    return []
  })

  return serializedNode
}

export function takeFullSnapshotForTesting(scope: SerializationScope): SerializedNodeWithId {
  let serializedDocument: SerializedNodeWithId | undefined

  scope.captureMutation(MutationKind.INITIAL_FULL_SNAPSHOT, (transaction) => {
    serializedDocument = serializeDocument(document, transaction)
    return [
      {
        data: {
          node: serializedDocument,
          initialOffset: {
            left: getScrollX(),
            top: getScrollY(),
          },
        },
        type: RecordType.FullSnapshot,
        timestamp: timeStampNow(),
      },
    ]
  })

  return serializedDocument!
}
