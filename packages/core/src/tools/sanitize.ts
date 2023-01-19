import { detachToJsonMethod } from './utils'

type DataWithToJson = unknown & { toJSON?: () => unknown }
type QueueElement = { source: Record<any, any>; target: Record<any, any>; path: string }

/**
 * Ensures user-provided data is 'safe' for the SDK
 * - Deep clones data
 * - Removes cyclic references
 * - Transforms unserializable types to a string representation
 *
 * LIMITATIONS:
 * - Size is in characters, not byte count
 * - Size does not take into account indentation that can be applied to JSON.stringify
 * - Non-numerical properties of Arrays are ignored. Same behavior as JSON.stringify
 *
 * @param data        User-provided data meant to be serialized using JSON.stringify
 * @param maxLength   Maximum number of characters allowed in serialized form
 * @returns
 */
export function sanitize(data: unknown, maxLength = 220000) {
  // Unbind any toJSON we may have on [] or {} prototypes
  const restoreObjectPrototypeToJson = detachToJsonMethod(Object.prototype)
  const restoreArrayPrototypeToJson = detachToJsonMethod(Array.prototype)

  // Initial call to sanitizeProcessor will populate queue if required
  const queue: QueueElement[] = []
  const visited = new WeakMap<object, string>()
  const clonedData = sanitizeProcessor(data, '$', null, queue, visited)
  let accumulatedSize = computeSize(clonedData)
  if (accumulatedSize > maxLength) {
    return undefined
  }

  while (queue.length > 0 && accumulatedSize < maxLength) {
    const current = queue.shift()!
    let first = 0

    // Arrays and Objects have to be handled distinctly to ensure
    // we do not pickup non-numerical properties from Arrays
    if (Array.isArray(current.source)) {
      const len = current.source.length
      for (let key = 0; key < len; key++) {
        const targetData = sanitizeProcessor(current.source[key], current.path, key, queue, visited)
        accumulatedSize += computeSize(targetData, first)
        if (accumulatedSize > maxLength) {
          break
        }
        first = 1
        current.target[key] = targetData
      }
    } else {
      for (const key in current.source) {
        if (Object.prototype.hasOwnProperty.call(current.source, key)) {
          const targetData = sanitizeProcessor(current.source[key], current.path, key, queue, visited)
          accumulatedSize += computeSize(targetData, first, key)
          if (accumulatedSize > maxLength) {
            break
          }
          first = 1
          current.target[key] = targetData
        }
      }
    }
  }

  // Rebind detached toJSON functions
  restoreObjectPrototypeToJson()
  restoreArrayPrototypeToJson()

  return clonedData
}

/**
 * Internal function to factorize the process common to the
 * initial call to sanitize, and iterations for Arrays and Objects
 *
 */
function sanitizeProcessor(
  source: any,
  parentPath: string,
  key: string | number | null,
  queue: QueueElement[],
  visited: WeakMap<object, string>
) {
  // Start by handling toJSON, as we want to sanitize its output
  const processedToJSon = handleToJSON(source)

  if (!processedToJSon || typeof processedToJSon !== 'object') {
    return sanitizeSimpleTypes(processedToJSon)
  }

  const processedSource = sanitizeObjects(processedToJSon)
  if (processedSource !== '[Object]' && processedSource !== '[Array]') {
    return processedSource
  }

  // Handle potential cyclic references
  if (visited.has(source)) {
    const path = visited.get(source)!
    return visited.get(source) === parentPath ? '[Circular Ref]' : `[Visited] ${path}`
  }

  // Add processed source to queue
  const currentPath = key ? `${parentPath}.${key}` : `${parentPath}`
  const clonedChild = (Array.isArray(source) ? [] : {}) as Record<any, any>
  visited.set(source, currentPath)
  queue.push({ source: processedToJSon, target: clonedChild, path: currentPath })

  return clonedChild
}

/**
 * Used to approximate the number of characters elements occupy inside a container
 * "key":"value" => returns a size of 13 if first, 14 otherwise
 *
 * LIMITATIONS
 * - Actual byte count may differ according to character encoding
 *
 * @param value     value in key/value pair
 * @param first     0 if first pair in container, 1 otherwise (accounts for the comma separator)
 * @param key       key in key/value pair (undefined for arrays)
 *
 */
function computeSize(value: unknown, first = 0, key?: string) {
  try {
    return JSON.stringify(value).length + first + (key ? key.length + 3 : 0)
  } catch {
    // We do not expect this to happen as complex types will have been processed previously
  }
  return 0
}

/**
 * Handles sanitization of simple, non-object types
 *
 */
function sanitizeSimpleTypes(value: unknown) {
  // BigInt cannot be serialized by JSON.stringify(), convert it to a string representation
  if (typeof value === 'bigint') {
    return `[BigInt] ${value.toString()}`
  }
  // Functions cannot be serialized by JSON.stringify(). Moreover, if a faulty toJSON is present, it needs to be converted
  // so it won't prevent stringify from serializing later
  if (typeof value === 'function') {
    return `[Function] ${value.name || 'unknown'}`
  }
  return value
}

/**
 * Handles sanitization of objects types
 *
 * LIMITATIONS
 * - If a class defines a toStringTag Symbol, it will fall in the catch-all method and prevent enumeration of properties.
 * To avoid this, a toJSON method can be defined.
 * - IE11 does not return a distinct type for objects such as Map, WeakMap, ... These objects will pass through and their
 * properties enumerated if any.
 *
 */
function sanitizeObjects(value: object) {
  try {
    // Handle events - Keep a simple implementation to avoid breaking changes
    if (value instanceof Event) {
      return {
        type: value.type,
        isTrusted: value.isTrusted,
      }
    }

    // Handle all remaining object types in a generic way
    const result = Object.prototype.toString.call(value)
    const match = result.match(/\[object (.*)\]/)
    if (match && match[1]) {
      return `[${match[1]}]`
    }
  } catch {
    // If the previous serialization attemps failed, and we cannot convert using
    // Object.prototype.toString, declare the value unserializable
  }
  return '[Unserializable]'
}

/**
 * Checks if a toJSON function exists and tries to execute it
 *
 */
function handleToJSON(value: DataWithToJson) {
  if (value && typeof value.toJSON === 'function') {
    try {
      return value.toJSON()
    } catch {
      // If toJSON fails, we continue by trying to serialize the value manually
    }
  }

  return value
}
