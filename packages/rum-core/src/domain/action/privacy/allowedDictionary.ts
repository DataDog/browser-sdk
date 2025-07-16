import { NodePrivacyLevel, TEXT_MASKING_CHAR, FIXED_MASKING_STRING } from '../../privacyConstants'
import { ACTION_NAME_PLACEHOLDER, ActionNameSource } from '../getActionNameFromElement'
import type { ClickActionBase } from '../trackClickActions'

declare global {
  interface Window {
    $DD_ALLOW?: Set<string>
    $DD_ALLOW_OBSERVERS?: Set<() => void>
  }
}

export const actionNameDictionary: AllowedDictionary = {
  rawStringCounter: 0,
  allowlist: new Set<string>(),
  rawStringIterator: undefined,
  clear: () => {
    actionNameDictionary.allowlist.clear()
    actionNameDictionary.rawStringCounter = 0
    actionNameDictionary.rawStringIterator = undefined
  },
}

type UnicodeRegexes = {
  matchRegex: RegExp
  splitRegex: RegExp
}

// Cache regex compilation and browser support detection
let cachedRegexes: UnicodeRegexes | undefined

export function getOrInitRegexes(): UnicodeRegexes | undefined {
  if (cachedRegexes !== undefined) {
    return cachedRegexes
  }

  try {
    cachedRegexes = {
      // Split on separators, control characters, and selected punctuation
      splitRegex: new RegExp('[^\\p{Separator}\\p{Cc}\\p{Sm}!"(),-./:;?[\\]`_{|}]+', 'gu'),
      // Match letters (including apostrophes), emojis, and mathematical symbols
      matchRegex: new RegExp("[\\p{Letter}’']+|[\\p{Emoji_Presentation}]+|[\\p{Sm}]+", 'gu'),
    }
  } catch {
    cachedRegexes = undefined
  }

  return cachedRegexes
}

export function tokenize(str: string): string[] {
  if (typeof str !== 'string' || !str.trim()) {
    return []
  }

  if (!getOrInitRegexes() || !cachedRegexes) {
    return []
  }

  const { matchRegex } = cachedRegexes
  return str.match(matchRegex) || []
}

export function isBrowserSupported(): boolean {
  return getOrInitRegexes() !== undefined
}

export type AllowedDictionary = {
  rawStringCounter: number
  allowlist: Set<string>
  rawStringIterator: IterableIterator<string> | undefined
  clear: () => void
}

export function createActionAllowList(): AllowedDictionary {
  actionNameDictionary.clear = () => {
    actionNameDictionary.allowlist.clear()
    actionNameDictionary.rawStringCounter = 0
    actionNameDictionary.rawStringIterator = undefined
    window.$DD_ALLOW_OBSERVERS?.delete(observer)
  }

  const observer = () => processRawAllowList(window.$DD_ALLOW, actionNameDictionary)
  processRawAllowList(window.$DD_ALLOW, actionNameDictionary)

  // Add observer
  if (!window.$DD_ALLOW_OBSERVERS) {
    window.$DD_ALLOW_OBSERVERS = new Set<() => void>()
  }
  window.$DD_ALLOW_OBSERVERS.add(observer)

  return actionNameDictionary
}

export function processRawAllowList(rawAllowlist: Set<string> | undefined, dictionary: AllowedDictionary): void {
  if (!rawAllowlist?.size) {
    return
  }

  if (!dictionary.rawStringIterator) {
    dictionary.rawStringIterator = rawAllowlist.values()
  }

  const currentSize = rawAllowlist.size
  while (dictionary.rawStringCounter < currentSize) {
    const nextItem = dictionary.rawStringIterator.next()
    dictionary.rawStringCounter++

    if (nextItem.value) {
      // Process raw string tokens directly
      const tokens = tokenize(nextItem.value)
      for (const token of tokens) {
        dictionary.allowlist.add(token.toLowerCase())
      }
    }
  }
}

export function maskTextContent(
  text: string,
  processedAllowlist: Set<string>,
  regexes: UnicodeRegexes,
  fixedMask?: string
): { maskedText: string; hasBeenMasked: boolean } {
  let hasBeenMasked = false

  const maskedText = text.replace(regexes.splitRegex, (segment: string) => {
    if (!processedAllowlist.has(segment.toLowerCase())) {
      hasBeenMasked = true
      return fixedMask ?? TEXT_MASKING_CHAR.repeat(segment.length)
    }
    return segment
  })

  return { maskedText, hasBeenMasked }
}

export function maskActionName(
  actionName: ClickActionBase,
  nodeSelfPrivacy: NodePrivacyLevel,
  processedAllowlist: Set<string>
): ClickActionBase {
  if (nodeSelfPrivacy === NodePrivacyLevel.ALLOW) {
    return actionName
  } else if (
    nodeSelfPrivacy !== NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED &&
    (!window.$DD_ALLOW || !window.$DD_ALLOW.size)
  ) {
    return actionName
  } // if the privacy level is MASK or MASK_USER_INPUT and the allowlist is present, we continue of masking the action name

  const { name, nameSource } = actionName
  const regexes = getOrInitRegexes()

  if (!regexes || !window.$DD_ALLOW || !window.$DD_ALLOW.size) {
    return {
      ...actionName,
      name: name ? ACTION_NAME_PLACEHOLDER : '',
      nameSource: name ? ActionNameSource.MASK_DISALLOWED : nameSource,
    }
  }

  const maskedName = maskTextContent(name, processedAllowlist, regexes, FIXED_MASKING_STRING)

  return {
    ...actionName,
    name: maskedName.maskedText,
    nameSource: maskedName.hasBeenMasked ? ActionNameSource.MASK_DISALLOWED : nameSource,
  }
}
