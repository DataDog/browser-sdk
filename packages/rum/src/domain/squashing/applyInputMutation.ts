import { NodeType, type SerializedNodeWithId, type ElementNode, type InputData } from '../../types'

export const applyInputMutation = (mutation: InputData, serialisedNodeMap: Map<number, SerializedNodeWithId>) => {
  const serialisedNode = serialisedNodeMap.get(mutation.id) as ElementNode
  if (!serialisedNode) {
    return
  }

  if (serialisedNode.type !== NodeType.Element) {
    return
  }

  // HTML attribute "checked" is set when present
  // See https://github.dev/DataDog/browser-sdk/blob/7ab238958ad748e145b936cbb24a2d034ae046ba/packages/rum/src/domain/record/observer.ts#L237-L238
  // An input element have both a checked and a value html attribute
  if ('isChecked' in mutation) {
    serialisedNode.attributes.checked = mutation.isChecked
  }
  if ('text' in mutation) {
    serialisedNode.attributes.value = mutation.text
  }
}
