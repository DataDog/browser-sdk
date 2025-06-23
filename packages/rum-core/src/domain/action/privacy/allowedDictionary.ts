declare global {
  interface Window {
    $DD_ALLOW?: Set<string>
    $DD_ALLOW_OBSERVERS?: Set<() => void>
  }
}

export function getMatchRegex(): RegExp {
  try {
    new RegExp('\\p{Letter}', 'u')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    // Fallback to support european letters and apostrophes
    return /(?:(?![×Þß÷þø])[a-zÀ-ÿ’])+|(?:(?!(?:(?![×Þß÷þø])[a-zÀ-ÿ’]))[^\s])+/gi
  }
  return /[\p{Letter}]+|[\p{Symbol}\p{Number}]+/gu
}

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
        processRawAllowList(window.$DD_ALLOW, actionNameDictionary)
      }
    },
    lastRawString: window.$DD_ALLOW?.values(),
  }
  actionNameDictionary.initializeAllowlist()
  return actionNameDictionary
}

export function processRawAllowList(rawAllowlist: Set<string> | undefined, dictionary: AllowedDictionary) {
  if (!rawAllowlist) {
    return
  }
  if (!dictionary.lastRawString) {
    dictionary.lastRawString = rawAllowlist.values()
  }
  const size = rawAllowlist.size
  let nextItem = dictionary.lastRawString.next()
  while (dictionary.updatedCounter < size && nextItem.value) {
    processRawString(nextItem.value, dictionary)
    if (dictionary.updatedCounter !== size - 1) {
      nextItem = dictionary.lastRawString.next()
    }
    dictionary.updatedCounter++
  }
}

function processRawString(str: string, dictionary: AllowedDictionary) {
  const words: string[] | null = str.match(getMatchRegex())
  if (words) {
    for (const word of words) {
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
  window.$DD_ALLOW_OBSERVERS.add(() => processRawAllowList(window.$DD_ALLOW, dictionary))
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
      if (!processedAllowlist.has(word.toLowerCase())) {
        masked = true
        return 'MASKED'
      }
      return word
    }),
    masked,
  }
}
