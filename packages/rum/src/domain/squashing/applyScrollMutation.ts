import type { ScrollData, BrowserFullSnapshotRecord, SerializedNodeWithId } from '../../types'
import { NodeType } from '../../types'

export const applyScrollMutation = (
  mutation: ScrollData,
  serialisedNodeMap: Map<number, SerializedNodeWithId>,
  fsRecord: BrowserFullSnapshotRecord
) => {
  const serialisedNode = serialisedNodeMap.get(mutation.id)
  if (!serialisedNode) {
    return
  }

  if (serialisedNode.type === NodeType.Document) {
    fsRecord.data.initialOffset.left = mutation.x
    fsRecord.data.initialOffset.top = mutation.y
  } else if (serialisedNode.type === NodeType.Element) {
    serialisedNode.attributes.rr_scrollLeft = mutation.x
    serialisedNode.attributes.rr_scrollTop = mutation.y
  } else {
    // We don't support scroll on other types of nodes
  }
}
