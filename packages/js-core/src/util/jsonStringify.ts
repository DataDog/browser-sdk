// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() {}

/**
 * Custom implementation of `JSON.stringify` that ignores `toJSON` methods on the value and its
 * prototype chain.
 *
 * Some sites badly override `toJSON` on built-in prototypes (e.g. `Object.prototype` or
 * `Array.prototype`), which would corrupt the serialised output. Removing all `toJSON` methods
 * from nested values would be too costly, so we only detach them from the root value and from
 * `Object` / `Array` prototypes before delegating to the native `JSON.stringify`.
 *
 * @param value - The value to serialise.
 * @param replacer - An optional array of allowed property names (same as `JSON.stringify`).
 * @param space - An optional indent width or string (same as `JSON.stringify`).
 * @returns The JSON string, or `undefined` for non-object primitives that `JSON.stringify` would
 * return `undefined` for.
 */
export function jsonStringify(
  value: unknown,
  replacer?: Array<string | number>,
  space?: string | number
): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return JSON.stringify(value)
  }

  // Note: The order matters here. We need to detach toJSON methods on parent classes before their
  // subclasses.
  const restoreObjectPrototypeToJson = detachToJsonMethod(Object.prototype)
  const restoreArrayPrototypeToJson = detachToJsonMethod(Array.prototype)
  const restoreValuePrototypeToJson = detachToJsonMethod(Object.getPrototypeOf(value))
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

/** An object that may have a custom `toJSON` serialisation method. */
export interface ObjectWithToJsonMethod {
  toJSON?: () => unknown
}

/**
 * Removes the `toJSON` method from an object if present and returns a function that restores it.
 *
 * Used by {@link jsonStringify} to temporarily neutralise overridden `toJSON` methods on
 * prototypes and values before delegating to the native `JSON.stringify`.
 *
 * @param value - The object from which to detach `toJSON`.
 * @returns A zero-argument function that re-attaches the original `toJSON` (or a no-op if the
 * object had none).
 */
export function detachToJsonMethod(value: object) {
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
