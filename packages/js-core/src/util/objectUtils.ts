// Prevent prototype pollution: __proto__ as an own property in parsed JSON can corrupt Object.prototype
const stripDangerousKeys = (key: string, value: unknown) => (key === '__proto__' ? undefined : value)

/**
 * Parses a JSON string, returning `undefined` instead of throwing when the input is invalid.
 *
 * `__proto__` keys are stripped from the parsed result (at any depth) to prevent prototype
 * pollution when parsing untrusted input (cookies, storage, network responses...).
 *
 * @param text - The JSON string to parse.
 * @returns The parsed value, or `undefined` if `text` is not valid JSON.
 */
export function tryJsonParse<T = unknown>(text: string): T | undefined {
  try {
    return JSON.parse(text, stripDangerousKeys) as T
  } catch {
    // ignore
  }
}

/**
 * Checks whether an object has no own enumerable string-keyed properties.
 *
 * @returns `true` if `Object.keys(object)` is empty.
 */
export function isEmptyObject(object: object) {
  return Object.keys(object).length === 0
}

/**
 * Returns the own enumerable string-keyed `[key, value]` pairs of an object.
 *
 * Thin wrapper around `Object.entries`: keep using it instead of the native method, as the wrapper
 * name can be mangled and results in a smaller bundle size.
 *
 * @returns An array of `[key, value]` tuples.
 */
export function objectEntries<T = unknown>(object: { [key: string]: T }): Array<[string, T]> {
  return Object.entries(object)
}
