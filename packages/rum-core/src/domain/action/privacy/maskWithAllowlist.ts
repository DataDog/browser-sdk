import { DefaultPrivacyLevel } from '@datadog/browser-core'
import { NodePrivacyLevel, TEXT_MASKING_CHAR } from '../../privacyConstants'

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
  return fixedMask || text.replace(/\S/g, TEXT_MASKING_CHAR)
}

export function isAllowlistMaskEnabled(
  defaultPrivacyLevel: NodePrivacyLevel,
  nodeSelfPrivacyLevel?: NodePrivacyLevel
): boolean {
  return (
    (defaultPrivacyLevel === DefaultPrivacyLevel.MASK_UNLESS_ALLOWLISTED &&
      nodeSelfPrivacyLevel !== NodePrivacyLevel.ALLOW) ||
    nodeSelfPrivacyLevel === NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED
  )
}
