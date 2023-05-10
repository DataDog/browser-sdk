import { display } from '../display'
import { ONE_KIBI_BYTE } from '../utils/byteUtils'
import type { Context, ContextArray, ContextValue } from './context'
import type { ObjectWithToJsonMethod } from './jsonStringify'
import { detachToJsonMethod } from './jsonStringify'

// eslint-disable-next-line @typescript-eslint/ban-types
type PrimitivesAndFunctions = string | number | boolean | undefined | null | symbol | bigint | Function
type ExtendedContextValue = PrimitivesAndFunctions | object | ExtendedContext | ExtendedContextArray
type ExtendedContext = { [key: string]: ExtendedContextValue }
type ExtendedContextArray = ExtendedContextValue[]

type ContainerElementToProcess = {
  source: ExtendedContextArray | ExtendedContext
  target: ContextArray | Context
  path: string
}

// The maximum size of a single event is 256KiB. By default, we ensure that user-provided data
// going through sanitize fits inside our events, while leaving room for other contexts, metadata, ...
const SANITIZE_DEFAULT_MAX_CHARACTER_COUNT = 220 * ONE_KIBI_BYTE

// Symbol for the root element of the JSONPath used for visited objects
const JSON_PATH_ROOT_ELEMENT = '$'

// When serializing (using JSON.stringify) a key of an object, { key: 42 } gets wrapped in quotes as "key".
// With the separator (:), we need to add 3 characters to the count.
const KEY_DECORATION_LENGTH = 3

/**
 * Ensures user-provided data is 'safe' for the SDK
 * - Deep clones data
 * - Removes cyclic references
 * - Transforms unserializable types to a string representation
 *
 * LIMITATIONS:
 * - Size is in characters, not byte count (may differ according to character encoding)
 * - Size does not take into account indentation that can be applied to JSON.stringify
 * - Non-numerical properties of Arrays are ignored. Same behavior as JSON.stringify
 *
 * @param source              User-provided data meant to be serialized using JSON.stringify
 * @param maxCharacterCount   Maximum number of characters allowed in serialized form
 */
export function sanitize(source: string, maxCharacterCount?: number): string | undefined
export function sanitize(source: Context, maxCharacterCount?: number): Context
export function sanitize(source: unknown, maxCharacterCount?: number): ContextValue
export function sanitize(source: unknown, maxCharacterCount = SANITIZE_DEFAULT_MAX_CHARACTER_COUNT) {
  // Unbind any toJSON function we may have on [] or {} prototypes
  const restoreObjectPrototypeToJson = detachToJsonMethod(Object.prototype)
  const restoreArrayPrototypeToJson = detachToJsonMethod(Array.prototype)

  // Initial call to sanitizeProcessor - will populate containerQueue if source is an Array or a plain Object
  const containerQueue: ContainerElementToProcess[] = []
  const visitedObjectsWithPath = new WeakMap<object, string>()
  const sanitizedData = sanitizeProcessor(
    source as ExtendedContextValue,
    JSON_PATH_ROOT_ELEMENT,
    undefined,
    containerQueue,
    visitedObjectsWithPath
  )
  let accumulatedCharacterCount = JSON.stringify(sanitizedData)?.length || 0
  if (accumulatedCharacterCount > maxCharacterCount) {
    warnOverCharacterLimit(maxCharacterCount, 'discarded', source)
    return undefined
  }

  while (containerQueue.length > 0 && accumulatedCharacterCount < maxCharacterCount) {
    const containerToProcess = containerQueue.shift()!
    let separatorLength = 0 // 0 for the first element, 1 for subsequent elements

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

        if (targetData !== undefined) {
          accumulatedCharacterCount += JSON.stringify(targetData).length
        } else {
          // When an element of an Array (targetData) is undefined, it is serialized as null:
          // JSON.stringify([undefined]) => '[null]' - This accounts for 4 characters
          accumulatedCharacterCount += 4
        }
        accumulatedCharacterCount += separatorLength
        separatorLength = 1
        if (accumulatedCharacterCount > maxCharacterCount) {
          warnOverCharacterLimit(maxCharacterCount, 'truncated', source)
          break
        }
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
          // When a property of an object has an undefined value, it will be dropped during serialization:
          // JSON.stringify({a:undefined}) => '{}'
          if (targetData !== undefined) {
            accumulatedCharacterCount +=
              JSON.stringify(targetData).length + separatorLength + key.length + KEY_DECORATION_LENGTH
            separatorLength = 1
          }
          if (accumulatedCharacterCount > maxCharacterCount) {
            warnOverCharacterLimit(maxCharacterCount, 'truncated', source)
            break
          }
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
  queue: ContainerElementToProcess[],
  visitedObjectsWithPath: WeakMap<object, string>
) {
  // Start by handling toJSON, as we want to sanitize its output
  const sourceToSanitize = tryToApplyToJSON(source)

  if (!sourceToSanitize || typeof sourceToSanitize !== 'object') {
    return sanitizePrimitivesAndFunctions(sourceToSanitize)
  }

  const sanitizedSource = sanitizeObjects(sourceToSanitize)
  if (sanitizedSource !== '[Object]' && sanitizedSource !== '[Array]' && sanitizedSource !== '[Error]') {
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
  const currentPath = key !== undefined ? `${parentPath}.${key}` : parentPath
  const target = Array.isArray(sourceToSanitize) ? ([] as ContextArray) : ({} as Context)
  visitedObjectsWithPath.set(sourceAsObject, currentPath)
  queue.push({ source: sourceToSanitize as ExtendedContext | ExtendedContextArray, target, path: currentPath })

  return target
}

/**
 * Handles sanitization of simple, non-object types
 *
 */
function sanitizePrimitivesAndFunctions(value: PrimitivesAndFunctions) {
  // BigInt cannot be serialized by JSON.stringify(), convert it to a string representation
  if (typeof value === 'bigint') {
    return `[BigInt] ${value.toString()}`
  }
  // Functions cannot be serialized by JSON.stringify(). Moreover, if a faulty toJSON is present, it needs to be converted
  // so it won't prevent stringify from serializing later
  if (typeof value === 'function') {
    return `[Function] ${value.name || 'unknown'}`
  }
  // JSON.stringify() does not serialize symbols.
  if (typeof value === 'symbol') {
    // symbol.description is part of ES2019+
    type symbolWithDescription = symbol & { description: string }
    return `[Symbol] ${(value as symbolWithDescription).description || value.toString()}`
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

/**
 * Helper function to display the warning when the accumulated character count is over the limit
 */
function warnOverCharacterLimit(maxCharacterCount: number, changeType: 'discarded' | 'truncated', source: unknown) {
  display.warn(
    `The data provided has been ${changeType} as it is over the limit of ${maxCharacterCount} characters:`,
    source
  )
}
