import { censorText, NodePrivacyLevel } from '../../privacyConstants'
import { getParentNode } from '../../../browser/htmlDomUtils'
import { getNodeSelfPrivacyLevel } from '../../privacy'

declare global {
  interface Window {
    $DD_ALLOW?: Set<string>
  }
}

export function maskDisallowedTextContent(text: string, fixedMask?: string): string {
  if (!text.trim()) {
    return text
  }
  // We are using toLocaleLowerCase when adding to the allowlist to avoid case sensitivity
  // so we need to do the same here
  if (window.$DD_ALLOW && window.$DD_ALLOW.has(text.toLocaleLowerCase())) {
    return text
  }
  return fixedMask || censorText(text)
}

// Check whether the "mask unless allowlisted" privacy level is used anywhere on the node or its
// ancestors. This indicates that the user intended to use the allowlist feature. In this case, we
// should respect their intention.
export function isAllowlistMaskEnabled(node: Node, defaultPrivacyLevel: NodePrivacyLevel): boolean {
  if (
    defaultPrivacyLevel === NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED ||
    getNodeSelfPrivacyLevel(node) === NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED
  ) {
    return true
  }
  const parentNode = getParentNode(node)
  if (parentNode) {
    return isAllowlistMaskEnabled(parentNode, defaultPrivacyLevel)
  }
  return false
}
