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

/**
 * Performs a deep merge of objects and arrays.
 * - Sources won't be mutated
 * - Object and arrays in the output value are dereferenced ("deep cloned")
 * - Arrays values are merged index by index
 * - Objects are merged by keys
 * - Values get replaced, unless undefined
 *
 * ⚠️ This function does not prevent infinite loops while merging circular references
 */
function deepMerge(...sources: ContextValue[]): ContextValue {
  let destination: ContextValue

  for (let i = sources.length - 1; i >= 0; i -= 1) {
    const source = sources[i]

    if (source === undefined) {
      // Ignore any undefined source.
      continue
    }

    if (destination === undefined) {
      // This is the first defined source.  If it is "mergeable" (array or object), initialize the
      // destination with an empty value that will be populated with all sources sub values.  Else,
      // just return its value.
      if (isContext(source)) {
        destination = {}
      } else if (isContextArray(source)) {
        destination = []
      } else {
        destination = source
        break
      }
    }

    // At this point, 'destination' is either an array or an object.  If the current 'source' has
    // the same type we can merge it.  Else, don't try to merge it or any other source.
    if (isContext(destination) && isContext(source)) {
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          destination[key] = deepMerge(source[key], destination[key])
        }
      }
    } else if (isContextArray(destination) && isContextArray(source)) {
      destination.length = Math.max(destination.length, source.length)
      for (let index = 0; index < source.length; index += 1) {
        destination[index] = deepMerge(source[index], destination[index])
      }
    } else {
      break
    }
  }

  return destination
}

export function combine<A, B>(a: A, b: B): A & B
export function combine<A, B, C>(a: A, b: B, c: C): A & B & C
export function combine<A, B, C, D>(a: A, b: B, c: C, d: D): A & B & C & D
export function combine(destination: Context, ...toMerge: Array<Context | null>): Context {
  return deepMerge(destination, ...toMerge.filter((object) => object !== null)) as Context
}

export function deepClone<T extends ContextValue>(context: T): T {
  return deepMerge(context) as T
}
