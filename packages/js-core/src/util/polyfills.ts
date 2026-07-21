/**
 * Returns the values of an object as an array, equivalent to `Object.values(object)`.
 *
 * Defined as a named wrapper rather than an inline `Object.values` call so that bundlers can
 * mangle the property name, reducing bundle size when the function is called in many places.
 *
 * @param object - The object whose enumerable own property values to return.
 * @returns An array of the object's values.
 */
export function objectValues<T = unknown>(object: { [key: string]: T }) {
  return Object.values(object)
}
