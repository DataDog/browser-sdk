import { CENSORED_STRING_MARK } from '../../privacy'

declare global {
  interface Window {
    $DD_ALLOW?: Set<string>
    $DD_ALLOW_OBSERVERS?: Set<() => void>
  }
}
let matchRegex: RegExp | undefined

export function getMatchRegex(): RegExp {
  if (!matchRegex) {
    try {
      matchRegex = new RegExp('\\p{Letter}+|[\\p{Symbol}\\p{Number}]+', 'gu')
    } catch {
      // Fallback to support european letters and apostrophes
      matchRegex = /(?:(?![×Þß÷þø])[a-zÀ-ÿ’])+|(?:(?!(?:(?![×Þß÷þø])[a-zÀ-ÿ’]))[^\s])+/gi
    }
  }
  return matchRegex
}

export type AllowedDictionary = {
  rawStringCounter: number
  allowlist: Set<string>
  rawStringIterator: SetIterator<string> | undefined
  clear: () => void
}

export function createActionAllowList(): AllowedDictionary {
  const actionNameDictionary: AllowedDictionary = {
    rawStringCounter: 0,
    allowlist: new Set<string>(),
    rawStringIterator: window.$DD_ALLOW?.values(),
    clear: () => {
      clearActionNameDictionary(actionNameDictionary, observer)
    },
  }
  const observer = () => processRawAllowList(window.$DD_ALLOW, actionNameDictionary)
  initializeAllowlist(actionNameDictionary)
  addAllowlistObserver(observer)

  return actionNameDictionary
}

export function clearActionNameDictionary(dictionary: AllowedDictionary, observer: () => void): void {
  dictionary.allowlist.clear()
  dictionary.rawStringCounter = 0
  dictionary.rawStringIterator = undefined
  window.$DD_ALLOW_OBSERVERS?.delete(observer)
}

function initializeAllowlist(actionNameDictionary: AllowedDictionary): void {
  if (actionNameDictionary.allowlist.size === 0) {
    processRawAllowList(window.$DD_ALLOW, actionNameDictionary)
  }
}

export function processRawAllowList(rawAllowlist: Set<string> | undefined, dictionary: AllowedDictionary) {
  if (!rawAllowlist) {
    return
  }
  if (!dictionary.rawStringIterator) {
    dictionary.rawStringIterator = rawAllowlist.values()
  }
  const size = rawAllowlist.size
  while (dictionary.rawStringCounter < size) {
    const nextItem = dictionary.rawStringIterator.next()
    dictionary.rawStringCounter++
    if (nextItem.value) {
      processRawString(nextItem.value, dictionary)
    }
  }
}

function processRawString(str: string, dictionary: AllowedDictionary) {
  const words: string[] | null = str.match(getMatchRegex())
  if (words) {
    for (const word of words) {
      const normalizeWord = word.toLocaleLowerCase()
      dictionary.allowlist.add(normalizeWord)
    }
  }
}

export function addAllowlistObserver(observer: () => void): void {
  if (!window.$DD_ALLOW_OBSERVERS) {
    window.$DD_ALLOW_OBSERVERS = new Set<() => void>()
  }
  window.$DD_ALLOW_OBSERVERS.add(observer)
}

export function maskActionName(
  name: string,
  processedAllowlist: Set<string>
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
    name: name.replace(getMatchRegex(), (word: string) => {
      if (!processedAllowlist.has(word.toLocaleLowerCase())) {
        masked = true
        return CENSORED_STRING_MARK
      }
      return word
    }),
    masked,
  }
}
