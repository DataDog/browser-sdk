export interface Context {
  [x: string]: ContextValue
}

export type ContextValue = string | number | boolean | Context | ContextArray | undefined | null

export interface ContextArray extends Array<ContextValue> {}

export function withSnakeCaseKeys(candidate: Context): Context {
  const result: Context = {}
  Object.keys(candidate as Context).forEach((key: string) => {
    result[toSnakeCase(key)] = deepSnakeCase(candidate[key])
  })
  return result as Context
}

export function deepSnakeCase(candidate: ContextValue): ContextValue {
  if (Array.isArray(candidate)) {
    return candidate.map((value: ContextValue) => deepSnakeCase(value))
  }
  if (typeof candidate === 'object' && candidate !== null) {
    return withSnakeCaseKeys(candidate)
  }
  return candidate
}

export function toSnakeCase(word: string) {
  return word
    .replace(
      /[A-Z]/g,
      (uppercaseLetter: string, index: number) => `${index !== 0 ? '_' : ''}${uppercaseLetter.toLowerCase()}`
    )
    .replace(/-/g, '_')
}

const isContextArray = (value: ContextValue): value is ContextArray => Array.isArray(value)
const isContext = (value: ContextValue): value is Context =>
  !Array.isArray(value) && typeof value === 'object' && value !== null

/*
 * Performs a deep merge of objects and arrays.
 * - Arguments won't be mutated
 * - Object and arrays in the output value are dereferenced ("deep cloned")
 * - Arrays values are merged index by index
 * - Objects are merged by keys
 * - Values get replaced, unless undefined
 * - Circular references are replaced by 'undefined'
 */
export function combine<A, B>(a: A, b: B): A & B
export function combine<A, B, C>(a: A, b: B, c: C): A & B & C
export function combine<A, B, C, D>(a: A, b: B, c: C, d: D): A & B & C & D
export function combine(...sources: ContextValue[]): ContextValue {
  let destination: ContextValue

  for (const source of sources) {
    // Ignore any undefined or null sources.
    if (source === undefined || source === null) {
      continue
    }

    destination = mergeInto(destination, source, createCircularReferenceChecker())
  }

  return destination
}

/*
 * Performs a deep clone of objects and arrays.
 * - Circular references are replaced by 'undefined'
 */
export function deepClone<T extends ContextValue>(context: T): T {
  return mergeInto(undefined, context, createCircularReferenceChecker()) as T
}

interface CircularReferenceChecker {
  // Add a value and return true if it was already added
  hasAlreadyBeenSeen(value: Context | ContextArray): boolean
}
export function createCircularReferenceChecker(): CircularReferenceChecker {
  if (typeof WeakSet !== 'undefined') {
    const set: WeakSet<Context | ContextArray> = new WeakSet()
    return {
      hasAlreadyBeenSeen(value) {
        const has = set.has(value)
        if (!has) {
          set.add(value)
        }
        return has
      },
    }
  }
  const array: Array<Context | ContextArray> = []
  return {
    hasAlreadyBeenSeen(value) {
      const has = array.indexOf(value) >= 0
      if (!has) {
        array.push(value)
      }
      return has
    },
  }
}

/**
 * Iterate over 'source' and affect its subvalues into 'destination', recursively.  If the 'source'
 * and 'destination' can't be merged, return 'source'.
 */
export function mergeInto(
  destination: ContextValue,
  source: ContextValue,
  circularReferenceChecker: CircularReferenceChecker
) {
  // Ignore the 'source' if it is undefined
  if (source === undefined) {
    return destination
  }

  // If the 'source' is not an object or array, it can't be merged with 'destination' in any way, so
  // return it directly.
  if (!isContext(source) && !isContextArray(source)) {
    return source
  }

  // Return 'undefined' if we already iterated over this 'source' to avoid infinite recursion
  if (circularReferenceChecker.hasAlreadyBeenSeen(source)) {
    return undefined
  }

  // 'source' and 'destination' are objects, merge them together
  if (isContext(source) && (destination === undefined || isContext(destination))) {
    const finalDestination = destination || {}
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        finalDestination[key] = mergeInto(finalDestination[key], source[key], circularReferenceChecker)
      }
    }
    return finalDestination
  }

  // 'source' and 'destination' are arrays, merge them together
  if (isContextArray(source) && (destination === undefined || isContextArray(destination))) {
    const finalDestination = destination || []
    finalDestination.length = Math.max(finalDestination.length, source.length)
    for (let index = 0; index < source.length; index += 1) {
      finalDestination[index] = mergeInto(finalDestination[index], source[index], circularReferenceChecker)
    }
    return finalDestination
  }

  // The destination in not an array nor an object, so we can't merge it
  return source
}
