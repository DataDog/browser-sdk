import type { Context, ContextArray, ContextValue } from './context'
import type { ObjectWithToJsonMethod } from './utils'
import { detachToJsonMethod, ONE_KIBI_BYTE } from './utils'

type ContainerElementsToProcess = { source: ContextArray | Context; target: ContextArray | Context; path: string }
// eslint-disable-next-line @typescript-eslint/ban-types
type ExtendedContextValue = ContextValue | symbol | bigint | Function

// The maximum size of a single event is 256KiB. By default, we ensure that user-provided data
// going through sanitize fits inside our events, while leaving room for other contexts, metadata, ...
const SANITIZE_DEFAULT_MAX_CHARACTER_COUNT = 220 * ONE_KIBI_BYTE

// Symbol for the root element of the JSONPath used for visited objects
const JSON_PATH_ROOT_ELEMENT = '$'

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
 * @param source              User-provided data meant to be serialized using JSON.stringify
 * @param maxCharacterCount   Maximum number of characters allowed in serialized form
 * @returns
 */
export function sanitize(source: string, maxCharacterCount?: number): string | undefined
export function sanitize(source: unknown, maxCharacterCount?: number): ContextValue
export function sanitize(source: unknown, maxCharacterCount = SANITIZE_DEFAULT_MAX_CHARACTER_COUNT) {
  // Unbind any toJSON function we may have on [] or {} prototypes
  const restoreObjectPrototypeToJson = detachToJsonMethod(Object.prototype)
  const restoreArrayPrototypeToJson = detachToJsonMethod(Array.prototype)

  // Initial call to sanitizeProcessor will populate queue if required
  const containerQueue: ContainerElementsToProcess[] = []
  const visitedObjectsWithPath = new WeakMap<object, string>()
  const sanitizedData = sanitizeProcessor(
    source as ExtendedContextValue,
    JSON_PATH_ROOT_ELEMENT,
    undefined,
    containerQueue,
    visitedObjectsWithPath
  )
  let accumulatedSize = computeSize(sanitizedData)
  if (accumulatedSize > maxCharacterCount) {
    return undefined
  }

  while (containerQueue.length > 0 && accumulatedSize < maxCharacterCount) {
    const containerToProcess = containerQueue.shift()!
    let separatorLength = 0

    // Arrays and Objects have to be handled distinctly to ensure
    // we do not pick up non-numerical properties from Arrays
    if (Array.isArray(containerToProcess.source)) {
      for (let key = 0; key < containerToProcess.source.length; key++) {
        const targetData = sanitizeProcessor(
          containerToProcess.source[key],
          containerToProcess.path,
          key,
          containerQueue,
          visitedObjectsWithPath
        )
        accumulatedSize += computeSize(targetData, separatorLength)
        if (accumulatedSize > maxCharacterCount) {
          break
        }
        separatorLength = 1
        ;(containerToProcess.target as ContextArray)[key] = targetData
      }
    } else {
      for (const key in containerToProcess.source) {
        if (Object.prototype.hasOwnProperty.call(containerToProcess.source, key)) {
          const targetData = sanitizeProcessor(
            containerToProcess.source[key],
            containerToProcess.path,
            key,
            containerQueue,
            visitedObjectsWithPath
          )
          accumulatedSize += computeSize(targetData, separatorLength, key)
          if (accumulatedSize > maxCharacterCount) {
            break
          }
          separatorLength = 1
          ;(containerToProcess.target as Context)[key] = targetData
        }
      }
    }
  }

  // Rebind detached toJSON functions
  restoreObjectPrototypeToJson()
  restoreArrayPrototypeToJson()

  return sanitizedData
}

/**
 * Internal function to factorize the process common to the
 * initial call to sanitize, and iterations for Arrays and Objects
 *
 */
function sanitizeProcessor(
  source: ExtendedContextValue,
  parentPath: string,
  key: string | number | undefined,
  queue: ContainerElementsToProcess[],
  visitedObjectsWithPath: WeakMap<object, string>
) {
  // Start by handling toJSON, as we want to sanitize its output
  const sourceToSanitize = tryToApplyToJSON(source)

  if (!sourceToSanitize || typeof sourceToSanitize !== 'object') {
    return sanitizePrimitivesAndFunctions(sourceToSanitize)
  }

  const sanitizedSource = sanitizeObjects(sourceToSanitize)
  if (sanitizedSource !== '[Object]' && sanitizedSource !== '[Array]') {
    return sanitizedSource
  }

  // Handle potential cyclic references
  // We need to use source as sourceToSanitize could be a reference to a new object
  // At this stage, we know the source is an object type
  const sourceAsObject = source as object
  if (visitedObjectsWithPath.has(sourceAsObject)) {
    return `[Reference seen at ${visitedObjectsWithPath.get(sourceAsObject)!}]`
  }

  // Add processed source to queue
  const currentPath = key ? `${parentPath}.${key}` : `${parentPath}`
  const target = Array.isArray(sourceToSanitize) ? [] : {}
  visitedObjectsWithPath.set(sourceAsObject, currentPath)
  queue.push({ source: sourceToSanitize, target, path: currentPath })

  return target
}

/**
 * Used to approximate the number of characters elements occupy inside a container
 * "key":"value" => returns a size of 13 if first value in collection (separatorLength=0), 14 otherwise (separatorLength=1)
 *
 * LIMITATIONS
 * - Actual byte count may differ according to character encoding
 *
 * @param value              value in key/value pair
 * @param separatorLength    0 if first pair in container, 1 otherwise (accounts for the comma separator)
 * @param key                key in key/value pair (undefined for arrays)
 *
 */
function computeSize(value: ContextValue, separatorLength = 0, key?: string) {
  try {
    return JSON.stringify(value).length + separatorLength + (key ? key.length + 3 : 0)
  } catch {
    // We do not expect this to happen as complex types will have been processed previously
  }
  return 0
}

/**
 * Handles sanitization of simple, non-object types
 *
 */
function sanitizePrimitivesAndFunctions(value: ExtendedContextValue) {
  // BigInt cannot be serialized by JSON.stringify(), convert it to a string representation
  if (typeof value === 'bigint') {
    return `[BigInt] ${value.toString()}`
  }
  // Functions cannot be serialized by JSON.stringify(). Moreover, if a faulty toJSON is present, it needs to be converted
  // so it won't prevent stringify from serializing later
  if (typeof value === 'function') {
    return `[Function] ${value.name || 'unknown'}`
  }
  // JSON.stringify() does not serialize symbols. We cannot use (yet) symbol.description as it is part of ES2019+
  if (typeof value === 'symbol') {
    return `[Symbol] ${value.toString()}`
  }

  return value
}

/**
 * Handles sanitization of object types
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
    // If the previous serialization attempts failed, and we cannot convert using
    // Object.prototype.toString, declare the value unserializable
  }
  return '[Unserializable]'
}

/**
 * Checks if a toJSON function exists and tries to execute it
 *
 */
function tryToApplyToJSON(value: ExtendedContextValue) {
  const object = value as ObjectWithToJsonMethod
  if (object && typeof object.toJSON === 'function') {
    try {
      return object.toJSON() as ExtendedContextValue
    } catch {
      // If toJSON fails, we continue by trying to serialize the value manually
    }
  }

  return value
}
