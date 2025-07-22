import { TEXT_MASKING_CHAR } from '../../privacyConstants'
import { ACTION_NAME_PLACEHOLDER, ActionNameSource } from '../actionNameConstants'
import type { ActionName } from '../actionNameConstants'

declare global {
  interface Window {
    $DD_ALLOW?: Set<string>
  }
}

export function maskTextContent(text: string, fixedMask?: string): { maskedText: string; hasBeenMasked: boolean } {
  if (!text.trim()) {
    return { maskedText: text, hasBeenMasked: false }
  }
  // We are using toLocaleLowerCase when adding to the allowlist to avoid case sensitivity
  if (window.$DD_ALLOW && window.$DD_ALLOW.has(text.toLocaleLowerCase())) {
    return { maskedText: text, hasBeenMasked: false }
  }
  return { maskedText: fixedMask || text.replace(/\S/g, TEXT_MASKING_CHAR), hasBeenMasked: true }
}

export function maskDisallowedActionName(actionName: ActionName): ActionName {
  const { name, nameSource } = actionName
  if (!window.$DD_ALLOW || !window.$DD_ALLOW.size) {
    // always fail close if $DD_ALLOW is not defined
    return {
      ...actionName,
      name: name ? ACTION_NAME_PLACEHOLDER : '',
      nameSource: name ? ActionNameSource.MASK_DISALLOWED : nameSource,
    }
  }
  const maskedName = maskTextContent(name, ACTION_NAME_PLACEHOLDER)

  return {
    ...actionName,
    name: maskedName.maskedText,
    nameSource: maskedName.hasBeenMasked ? ActionNameSource.MASK_DISALLOWED : nameSource,
  }
}
