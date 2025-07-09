import { NodePrivacyLevel, TEXT_MASKING_CHAR } from '../../privacy'
import { ACTION_NAME_PLACEHOLDER, ActionNameSource } from '../getActionNameFromElement'
import type { ClickActionBase } from '../trackClickActions'

declare global {
  interface Window {
    $DD_ALLOW?: Set<string>
    $DD_ALLOW_OBSERVERS?: Set<() => void>
  }
}

type UnicodeRegexes = {
  matchRegex: RegExp
  splitRegex: RegExp
}

// Cache regex compilation and browser support detection
let cachedRegexes: UnicodeRegexes | undefined

function getOrInitRegexes(): UnicodeRegexes | undefined {
  if (cachedRegexes !== undefined) {
    return cachedRegexes
  }

  try {
    cachedRegexes = {
      // Split on punctuation, separators, and control characters
      splitRegex: new RegExp(`[^\\p{Separator}\\p{Cc}\\p{Sm}!"(),-./:;?[\\]\`_{|}]+`, 'gu'),
      // Match letters (including apostrophes), emojis, and mathematical symbols
      matchRegex: new RegExp("[\\p{Letter}’']+|[\\p{Emoji_Presentation}]+|[\\p{Sm}]+", 'gu'),
    }
  } catch { 
    cachedRegexes = undefined
  }

  return cachedRegexes
}

export function tokenize(str: string): string[] {
  if (!str.trim()) {
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
  const dictionary: AllowedDictionary = {
    rawStringCounter: 0,
    allowlist: new Set<string>(),
    rawStringIterator: undefined,
    clear: () => {
      dictionary.allowlist.clear()
      dictionary.rawStringCounter = 0
      dictionary.rawStringIterator = undefined
      window.$DD_ALLOW_OBSERVERS?.delete(observer)
    },
  }

  const observer = () => processRawAllowList(window.$DD_ALLOW, dictionary)
  processRawAllowList(window.$DD_ALLOW, dictionary)

  // Add observer
  if (!window.$DD_ALLOW_OBSERVERS) {
    window.$DD_ALLOW_OBSERVERS = new Set<() => void>()
  }
  window.$DD_ALLOW_OBSERVERS.add(observer)

  return dictionary
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

export function maskActionName(
  actionName: ClickActionBase,
  nodeSelfPrivacy: NodePrivacyLevel,
  processedAllowlist: Set<string>
): ClickActionBase {
  if (!window.$DD_ALLOW) {
    return actionName
  }

  if (nodeSelfPrivacy === NodePrivacyLevel.ALLOW) {
    return actionName
  }

  const { name, nameSource } = actionName
  const regexes = getOrInitRegexes()

  if (!regexes) {
    return {
      ...actionName,
      name: name ? ACTION_NAME_PLACEHOLDER : '',
      nameSource: name ? ActionNameSource.MASK_DISALLOWED : nameSource,
    }
  }

  let hasBeenMasked = false

  const maskedName = name.replace(regexes.splitRegex, (segment: string) => {
    if (!processedAllowlist.has(segment.toLowerCase())) {
      hasBeenMasked = true
      return TEXT_MASKING_CHAR.repeat(segment.length)
    }
    return segment
  })

  return {
    ...actionName,
    name: maskedName,
    nameSource: hasBeenMasked ? ActionNameSource.MASK_DISALLOWED : nameSource,
  }
}
