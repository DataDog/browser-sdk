interface ObjectWithToJsonMethod {
  toJSON?: () => unknown
}

function noop() {
  // do nothing
}

/**
 * Temporarily removes a `toJSON` method from an object, if it has one, so that `JSON.stringify`
 * serializes its own enumerable properties instead of delegating to a custom `toJSON`
 * implementation (e.g. `Error.prototype.toJSON` added by some libraries).
 *
 * @param value - The object to detach the `toJSON` method from.
 * @returns A function that restores the original `toJSON` method (or does nothing if the object
 * did not have one).
 */
function detachToJsonMethod(value: object) {
  const object = value as ObjectWithToJsonMethod
  const objectToJson = object.toJSON
  if (objectToJson) {
    delete object.toJSON
    return () => {
      object.toJSON = objectToJson
    }
  }
  return noop
}

/**
 * Serializes a value to a JSON string, tolerating values that would normally make
 * `JSON.stringify` throw (circular references, `BigInt`, ...) or produce misleading output (values
 * with a custom `toJSON` method, e.g. some `Error` polyfills).
 *
 * Prefer this over `JSON.stringify` directly when serializing values of unknown origin (for
 * example, formatting an arbitrary non-`Error` value caught in an error handler).
 *
 * @param value - The value to serialize.
 * @param replacer - Same as `JSON.stringify`'s `replacer` parameter.
 * @param space - Same as `JSON.stringify`'s `space` parameter.
 * @returns The JSON string, `undefined` if `value` is `undefined` (or a function/symbol), or the
 * string `"<error: unable to serialize object>"` if serialization still fails.
 */
export function jsonStringify(
  value: unknown,
  replacer?: Array<string | number>,
  space?: string | number
): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return JSON.stringify(value)
  }

  const restoreObjectPrototypeToJson = detachToJsonMethod(Object.prototype)
  const restoreArrayPrototypeToJson = detachToJsonMethod(Array.prototype)
  const restoreValuePrototypeToJson = detachToJsonMethod(Object.getPrototypeOf(value) as object)
  const restoreValueToJson = detachToJsonMethod(value)

  try {
    return JSON.stringify(value, replacer, space)
  } catch {
    return '<error: unable to serialize object>'
  } finally {
    restoreObjectPrototypeToJson()
    restoreArrayPrototypeToJson()
    restoreValuePrototypeToJson()
    restoreValueToJson()
  }
}
