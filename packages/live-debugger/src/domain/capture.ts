export interface CaptureOptions {
  maxReferenceDepth?: number
  maxCollectionSize?: number
  maxFieldCount?: number
  maxLength?: number
}

export interface CapturedValue {
  type: string
  value?: string
  isNull?: boolean
  truncated?: boolean
  size?: number
  notCapturedReason?: string
  fields?: Record<string, CapturedValue>
  elements?: CapturedValue[]
  entries?: Array<[CapturedValue, CapturedValue]>
}

const hasReplaceAll = typeof (String.prototype as any).replaceAll === 'function'
const replaceDots = hasReplaceAll
  ? // @ts-expect-error
    (str: string) => str.replaceAll('.', '_')
  : (str: string) => str.replace(/\./g, '_')

const DEFAULT_MAX_REFERENCE_DEPTH = 3
const DEFAULT_MAX_COLLECTION_SIZE = 100
const DEFAULT_MAX_FIELD_COUNT = 20
const DEFAULT_MAX_LENGTH = 255

/**
 * Capture the value of the given object with configurable limits
 * @param value - The value to capture
 * @param opts - The capture options
 * @returns The captured value representation
 */
export function capture(
  value: unknown,
  {
    maxReferenceDepth = DEFAULT_MAX_REFERENCE_DEPTH,
    maxCollectionSize = DEFAULT_MAX_COLLECTION_SIZE,
    maxFieldCount = DEFAULT_MAX_FIELD_COUNT,
    maxLength = DEFAULT_MAX_LENGTH,
  }: CaptureOptions
): CapturedValue {
  return captureValue(value, 0, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
}

/**
 * Capture the fields of an object directly without the outer CapturedValue wrapper
 * @param obj - The object to capture
 * @param opts - The capture options
 * @returns A record mapping property names to their captured values
 */
export function captureFields(
  obj: object,
  {
    maxReferenceDepth = DEFAULT_MAX_REFERENCE_DEPTH,
    maxCollectionSize = DEFAULT_MAX_COLLECTION_SIZE,
    maxFieldCount = DEFAULT_MAX_FIELD_COUNT,
    maxLength = DEFAULT_MAX_LENGTH,
  }: CaptureOptions
): Record<string, CapturedValue> {
  return captureObjectPropertiesFields(obj, 0, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
}

function captureValue(
  value: unknown,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  // Handle null first as typeof null === 'object'
  if (value === null) return { type: 'null', isNull: true }

  const type = typeof value

  switch (type) {
    case 'undefined':
      return { type: 'undefined' }
    case 'boolean':
      return { type: 'boolean', value: String(value) }
    case 'number':
      return { type: 'number', value: String(value) }
    case 'string':
      return captureString(value as string, maxLength)
    case 'symbol':
      return { type: 'symbol', value: (value as symbol).description || '' }
    case 'bigint':
      return { type: 'bigint', value: String(value) }
    case 'function':
      return captureFunction(value as Function, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
    case 'object':
      return captureObject(value as object, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
    default:
      return { type: String(type), notCapturedReason: 'Unsupported type' }
  }
}

function captureString(str: string, maxLength: number): CapturedValue {
  const size = str.length

  if (size <= maxLength) {
    return { type: 'string', value: str }
  }

  return {
    type: 'string',
    value: str.slice(0, maxLength),
    truncated: true,
    size,
  }
}

function captureFunction(
  fn: Function,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  // Check if it's a class by converting to string and checking for 'class' keyword
  const fnStr = Function.prototype.toString.call(fn)
  const classMatch = fnStr.match(/^class\s([^{]*)/)

  if (classMatch !== null) {
    // This is a class
    const className = classMatch[1].trim()
    return { type: className ? `class ${className}` : 'class' }
  }

  // This is a function - serialize it as an object with its properties
  if (depth >= maxReferenceDepth) {
    return { type: 'Function', notCapturedReason: 'depth' }
  }

  return captureObjectProperties(
    fn as any,
    'Function',
    depth,
    maxReferenceDepth,
    maxCollectionSize,
    maxFieldCount,
    maxLength
  )
}

function captureObject(
  obj: object,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  if (depth >= maxReferenceDepth) {
    return { type: (obj as any).constructor?.name ?? 'Object', notCapturedReason: 'depth' }
  }

  // Built-in objects with specialized serialization
  if (obj instanceof Date) {
    return { type: 'Date', value: obj.toISOString() }
  }
  if (obj instanceof RegExp) {
    return { type: 'RegExp', value: obj.toString() }
  }
  if (obj instanceof Error) {
    return captureError(obj, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }
  if (obj instanceof Promise) {
    return { type: 'Promise', notCapturedReason: 'Promise state cannot be inspected' }
  }

  // Collections
  if (Array.isArray(obj)) {
    return captureArray(obj, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }
  if (obj instanceof Map) {
    return captureMap(obj, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }
  if (obj instanceof Set) {
    return captureSet(obj, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }
  if (obj instanceof WeakMap) {
    return { type: 'WeakMap', notCapturedReason: 'WeakMap contents cannot be enumerated' }
  }
  if (obj instanceof WeakSet) {
    return { type: 'WeakSet', notCapturedReason: 'WeakSet contents cannot be enumerated' }
  }

  // Binary data
  if (obj instanceof ArrayBuffer) {
    return captureArrayBuffer(obj)
  }
  if (typeof SharedArrayBuffer !== 'undefined' && obj instanceof SharedArrayBuffer) {
    return captureSharedArrayBuffer(obj)
  }
  if (obj instanceof DataView) {
    return captureDataView(obj)
  }
  if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
    return captureTypedArray(obj as TypedArray, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }

  // Custom objects
  const typeName = (obj as any).constructor?.name ?? 'Object'
  return captureObjectProperties(obj, typeName, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
}

function captureObjectPropertiesFields(
  obj: any,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): Record<string, CapturedValue> {
  const keys = Object.getOwnPropertyNames(obj)
  const symbolKeys = Object.getOwnPropertySymbols(obj)
  const allKeys = [...keys, ...symbolKeys]

  const keysToCapture = allKeys.slice(0, maxFieldCount)

  const fields: Record<string, CapturedValue> = {}
  for (const key of keysToCapture) {
    const keyStr = String(key)
    const keyName =
      typeof key === 'symbol' ? key.description || key.toString() : keyStr.includes('.') ? replaceDots(keyStr) : keyStr

    try {
      const propValue = obj[key]
      fields[keyName] = captureValue(
        propValue,
        depth + 1,
        maxReferenceDepth,
        maxCollectionSize,
        maxFieldCount,
        maxLength
      )
    } catch (err) {
      // Handle getters that throw or other access errors
      fields[keyName] = { type: 'undefined', notCapturedReason: 'Error accessing property' }
    }
  }

  return fields
}

function captureObjectProperties(
  obj: any,
  typeName: string,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  const keys = Object.getOwnPropertyNames(obj)
  const symbolKeys = Object.getOwnPropertySymbols(obj)
  const allKeys = [...keys, ...symbolKeys]
  const totalFields = allKeys.length

  const fields = captureObjectPropertiesFields(
    obj,
    depth,
    maxReferenceDepth,
    maxCollectionSize,
    maxFieldCount,
    maxLength
  )

  const result: CapturedValue = { type: typeName, fields }

  if (totalFields > maxFieldCount) {
    result.notCapturedReason = 'fieldCount'
    result.size = totalFields
  }

  return result
}

function captureArray(
  arr: unknown[],
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  const totalSize = arr.length
  const itemsToCapture = Math.min(totalSize, maxCollectionSize)

  const elements: CapturedValue[] = []
  for (let i = 0; i < itemsToCapture; i++) {
    elements.push(captureValue(arr[i], depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength))
  }

  const result: CapturedValue = { type: 'Array', elements }

  if (totalSize > maxCollectionSize) {
    result.notCapturedReason = 'collectionSize'
    result.size = totalSize
  }

  return result
}

function captureMap(
  map: Map<unknown, unknown>,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  const totalSize = map.size
  const entriesToCapture = Math.min(totalSize, maxCollectionSize)

  const entries: Array<[CapturedValue, CapturedValue]> = []
  let count = 0
  for (const [key, value] of map) {
    if (count >= entriesToCapture) break
    entries.push([
      captureValue(key, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength),
      captureValue(value, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength),
    ])
    count++
  }

  const result: CapturedValue = { type: 'Map', entries }

  if (totalSize > maxCollectionSize) {
    result.notCapturedReason = 'collectionSize'
    result.size = totalSize
  }

  return result
}

function captureSet(
  set: Set<unknown>,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  const totalSize = set.size
  const itemsToCapture = Math.min(totalSize, maxCollectionSize)

  const elements: CapturedValue[] = []
  let count = 0
  for (const value of set) {
    if (count >= itemsToCapture) break
    elements.push(captureValue(value, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength))
    count++
  }

  const result: CapturedValue = { type: 'Set', elements }

  if (totalSize > maxCollectionSize) {
    result.notCapturedReason = 'collectionSize'
    result.size = totalSize
  }

  return result
}

function captureError(
  err: Error,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  const typeName = (err as any).constructor?.name ?? 'Error'
  const fields: Record<string, CapturedValue> = {
    message: captureValue(err.message, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength),
    name: captureValue(err.name, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength),
  }

  if (err.stack !== undefined) {
    fields.stack = captureValue(err.stack, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }

  if ((err as any).cause !== undefined) {
    fields.cause = captureValue(
      (err as any).cause,
      depth + 1,
      maxReferenceDepth,
      maxCollectionSize,
      maxFieldCount,
      maxLength
    )
  }

  return { type: typeName, fields }
}

function captureArrayBuffer(buffer: ArrayBuffer): CapturedValue {
  return {
    type: 'ArrayBuffer',
    value: `[ArrayBuffer(${buffer.byteLength})]`,
  }
}

function captureSharedArrayBuffer(buffer: SharedArrayBuffer): CapturedValue {
  return {
    type: 'SharedArrayBuffer',
    value: `[SharedArrayBuffer(${buffer.byteLength})]`,
  }
}

function captureDataView(view: DataView): CapturedValue {
  return {
    type: 'DataView',
    fields: {
      byteLength: { type: 'number', value: String(view.byteLength) },
      byteOffset: { type: 'number', value: String(view.byteOffset) },
      buffer: { type: 'ArrayBuffer', value: `[ArrayBuffer(${view.buffer.byteLength})]` },
    },
  }
}

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array

function captureTypedArray(
  typedArray: TypedArray,
  depth: number,
  maxReferenceDepth: number,
  maxCollectionSize: number,
  maxFieldCount: number,
  maxLength: number
): CapturedValue {
  const typeName = typedArray.constructor?.name ?? 'TypedArray'
  const totalSize = typedArray.length
  const itemsToCapture = Math.min(totalSize, maxCollectionSize)

  const elements: CapturedValue[] = []
  for (let i = 0; i < itemsToCapture; i++) {
    elements.push(
      captureValue(typedArray[i], depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
    )
  }

  const result: CapturedValue = {
    type: typeName,
    elements,
    fields: {
      byteLength: { type: 'number', value: String(typedArray.byteLength) },
      byteOffset: { type: 'number', value: String(typedArray.byteOffset) },
      length: { type: 'number', value: String(typedArray.length) },
    },
  }

  if (totalSize > maxCollectionSize) {
    result.notCapturedReason = 'collectionSize'
    result.size = totalSize
  }

  return result
}
