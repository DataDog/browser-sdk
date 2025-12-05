// TODO: Support not triggering side effects when capturing
/**
 * Capture the value of the given object.
 * @param {unknown} value - The value to capture.
 * @param {Object} opts - The capture options.
 * @param {number} [opts.maxReferenceDepth=3] - Maximum reference depth to traverse objects.
 * @param {number} [opts.maxCollectionSize=100] - Maximum number of items to capture per array/collection.
 * @param {number} [opts.maxFieldCount=20] - Maximum number of fields to capture per object.
 * @param {number} [opts.maxLength=255] - Maximum length of string values.
 * @returns {Object} The captured value.
 */
export function capture (value, opts) {
  const maxReferenceDepth = opts.maxReferenceDepth ?? 3
  const maxCollectionSize = opts.maxCollectionSize ?? 100
  const maxFieldCount = opts.maxFieldCount ?? 20
  const maxLength = opts.maxLength ?? 255

  return captureValue(value, 0, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
}

function captureValue (value, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
  // Handle null first as typeof null === 'object'
  if (value === null) return { type: 'null', isNull: true }

  const type = typeof value

  switch (type) {
    case 'undefined': return { type: 'undefined' }
    case 'boolean': return { type: 'boolean', value: String(value) }
    case 'number': return { type: 'number', value: String(value) }
    case 'string': return captureString(value, maxLength)
    case 'symbol': return { type: 'symbol', value: value.description || '' }
    case 'bigint': return { type: 'bigint', value: String(value) }
    case 'function': return captureFunction(value, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
    case 'object': return captureObject(value, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
    default: return { type: String(type), notCapturedReason: 'Unsupported type' }
  }
}

function captureString (str, maxLength) {
  const size = str.length

  if (size <= maxLength) {
    return { type: 'string', value: str }
  }

  return {
    type: 'string',
    value: str.slice(0, maxLength),
    truncated: true,
    size
  }
}

function captureFunction (fn, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
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

  return captureObjectProperties(fn, 'Function', depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
}

function captureObject (obj, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
  if (depth >= maxReferenceDepth) {
    return { type: obj.constructor?.name ?? 'Object', notCapturedReason: 'depth' }
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
  if (obj instanceof SharedArrayBuffer) {
    return captureSharedArrayBuffer(obj)
  }
  if (obj instanceof DataView) {
    return captureDataView(obj)
  }
  if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
    return captureTypedArray(obj, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }

  // Custom objects
  const typeName = obj.constructor?.name ?? 'Object'
  return captureObjectProperties(obj, typeName, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
}

function captureObjectProperties (obj, typeName, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
  const keys = Object.getOwnPropertyNames(obj)
  const symbolKeys = Object.getOwnPropertySymbols(obj)
  const allKeys = [...keys, ...symbolKeys]

  const totalFields = allKeys.length
  const keysToCapture = allKeys.slice(0, maxFieldCount)

  const fields = {}
  for (const key of keysToCapture) {
    const keyName = typeof key === 'symbol'
      ? (key.description || key.toString())
      : String(key).includes('.') ? String(key).replaceAll('.', '_') : String(key)

    try {
      const propValue = obj[key]
      fields[keyName] = captureValue(propValue, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
    } catch (err) {
      // Handle getters that throw or other access errors
      fields[keyName] = { type: 'undefined', notCapturedReason: 'Error accessing property' }
    }
  }

  const result = { type: typeName, fields }

  if (totalFields > maxFieldCount) {
    result.notCapturedReason = 'fieldCount'
    result.size = totalFields
  }

  return result
}

function captureArray (arr, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
  const totalSize = arr.length
  const itemsToCapture = Math.min(totalSize, maxCollectionSize)

  const elements = []
  for (let i = 0; i < itemsToCapture; i++) {
    elements.push(captureValue(arr[i], depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength))
  }

  const result = { type: 'Array', elements }

  if (totalSize > maxCollectionSize) {
    result.notCapturedReason = 'collectionSize'
    result.size = totalSize
  }

  return result
}

function captureMap (map, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
  const totalSize = map.size
  const entriesToCapture = Math.min(totalSize, maxCollectionSize)

  const entries = []
  let count = 0
  for (const [key, value] of map) {
    if (count >= entriesToCapture) break
    entries.push([
      captureValue(key, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength),
      captureValue(value, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
    ])
    count++
  }

  const result = { type: 'Map', entries }

  if (totalSize > maxCollectionSize) {
    result.notCapturedReason = 'collectionSize'
    result.size = totalSize
  }

  return result
}

function captureSet (set, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
  const totalSize = set.size
  const itemsToCapture = Math.min(totalSize, maxCollectionSize)

  const elements = []
  let count = 0
  for (const value of set) {
    if (count >= itemsToCapture) break
    elements.push(captureValue(value, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength))
    count++
  }

  const result = { type: 'Set', elements }

  if (totalSize > maxCollectionSize) {
    result.notCapturedReason = 'collectionSize'
    result.size = totalSize
  }

  return result
}

function captureError (err, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
  const typeName = err.constructor?.name ?? 'Error'
  const fields = {
    message: captureValue(err.message, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength),
    name: captureValue(err.name, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }

  if (err.stack !== undefined) {
    fields.stack = captureValue(err.stack, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }

  if (err.cause !== undefined) {
    fields.cause = captureValue(err.cause, depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength)
  }

  return { type: typeName, fields }
}

function captureArrayBuffer (buffer) {
  return {
    type: 'ArrayBuffer',
    value: `[ArrayBuffer(${buffer.byteLength})]`
  }
}

function captureSharedArrayBuffer (buffer) {
  return {
    type: 'SharedArrayBuffer',
    value: `[SharedArrayBuffer(${buffer.byteLength})]`
  }
}

function captureDataView (view) {
  return {
    type: 'DataView',
    fields: {
      byteLength: { type: 'number', value: String(view.byteLength) },
      byteOffset: { type: 'number', value: String(view.byteOffset) },
      buffer: { type: 'ArrayBuffer', value: `[ArrayBuffer(${view.buffer.byteLength})]` }
    }
  }
}

function captureTypedArray (typedArray, depth, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength) {
  const typeName = typedArray.constructor?.name ?? 'TypedArray'
  const totalSize = typedArray.length
  const itemsToCapture = Math.min(totalSize, maxCollectionSize)

  const elements = []
  for (let i = 0; i < itemsToCapture; i++) {
    elements.push(captureValue(typedArray[i], depth + 1, maxReferenceDepth, maxCollectionSize, maxFieldCount, maxLength))
  }

  const result = {
    type: typeName,
    elements,
    fields: {
      byteLength: { type: 'number', value: String(typedArray.byteLength) },
      byteOffset: { type: 'number', value: String(typedArray.byteOffset) },
      length: { type: 'number', value: String(typedArray.length) }
    }
  }

  if (totalSize > maxCollectionSize) {
    result.notCapturedReason = 'collectionSize'
    result.size = totalSize
  }

  return result
}
