import { replaceAll } from '@datadog/browser-core'

declare global {
  interface Window {
    $DD_ALLOW?: Set<string>
    $DD_ALLOW_OBSERVERS?: Set<() => void>
  }
}

export const SPLIT_REGEX = /[A-Za-z]+|[\d!#%^&()_+=[\]{};:'"\\|/`]+/gu
const MAX_WORD_LENGTH = 20
export type AllowedDictionary = {
  updatedCounter: number
  allowlist: Set<string>
  initializeAllowlist: () => void
  lastRawString: SetIterator<string> | undefined
}

export function createActionAllowList(): AllowedDictionary {
  const actionNameDictionary: AllowedDictionary = {
    updatedCounter: 0,
    allowlist: new Set<string>(),
    initializeAllowlist: () => {
      if (!actionNameDictionary.allowlist || actionNameDictionary.allowlist.size === 0) {
        if (!window.$DD_ALLOW) {
          return // should perform initialization later
        }
        processAllowList(window.$DD_ALLOW, actionNameDictionary)
      }
    },
    lastRawString: window.$DD_ALLOW?.values(),
  }
  actionNameDictionary.initializeAllowlist()
  return actionNameDictionary
}

function processAllowList(allowlist: Set<string>, dictionary: AllowedDictionary) {
  const allowlistIterator = allowlist?.values()
  const size = allowlist?.size
  if (size === 0) {
    return
  }
  let nextItem = allowlistIterator.next()
  while (dictionary.updatedCounter < size && nextItem.value) {
    processRawString(nextItem.value, dictionary)
    if (dictionary.updatedCounter !== size - 1) {
      nextItem = allowlistIterator.next()
    }
    dictionary.updatedCounter++
  }
  dictionary.lastRawString = allowlistIterator
}

function processRawString(str: string, dictionary: AllowedDictionary) {
  const words: string[] | null = str.match(SPLIT_REGEX)
  if (words) {
    for (const word of words) {
      if (word.length > MAX_WORD_LENGTH) {
        continue
      }
      const normalizeWord = word.toLocaleLowerCase()
      if (!dictionary.allowlist.has(normalizeWord)) {
        dictionary.allowlist.add(normalizeWord)
      }
    }
  }
}

export function addAllowlistObserver(dictionary: AllowedDictionary) {
  if (!window.$DD_ALLOW_OBSERVERS) {
    window.$DD_ALLOW_OBSERVERS = new Set<() => void>()
  }
  window.$DD_ALLOW_OBSERVERS.add(() => updateDictionaryOnDDAllowChange(dictionary))
}

export function updateDictionaryOnDDAllowChange(dictionary: AllowedDictionary) {
  if (!window.$DD_ALLOW || dictionary.updatedCounter >= window.$DD_ALLOW.size) {
    return
  }
  if (!dictionary.lastRawString) {
    dictionary.lastRawString = window.$DD_ALLOW?.values()
  }

  let nextItem = dictionary.lastRawString.next()
  const newSize = window.$DD_ALLOW.size
  while (dictionary.updatedCounter < newSize && nextItem.value) {
    processRawString(nextItem.value, dictionary)
    if (dictionary.updatedCounter !== newSize - 1) {
      nextItem = dictionary.lastRawString.next()
    }
    dictionary.updatedCounter++
  }
}

export function maskAutoActionName(
  name: string,
  allowlist: Set<string>
): {
  masked: boolean
  name: string
} {
  if (!window.$DD_ALLOW) {
    return {
      name,
      masked: false,
    }
  }

  let masked = false
  return {
    name: replaceAll(name, SPLIT_REGEX, (word: string) => {
      if (!allowlist.has(word.toLowerCase())) {
        masked = true
        return 'MASKED'
      }
      return word
    }),
    masked,
  }
}
