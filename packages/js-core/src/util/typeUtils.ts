/**
 * Similar to `typeof`, but distinguish plain objects from `null` and arrays
 */
export function getType(value: unknown) {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}

/**
 * Checks whether a value can have properties. Use this when you have an unknown value and you want
 * to access its properties as unknown. This is a friendly solution for dealing with unknown objects
 * in TypeScript.
 *
 * This function is intended to be used on values that will be used as "plain objects", i.e. not
 * Array, Date, RegExp or other class instances. But it's safe to use on any value.
 *
 * @example
 * ```
 * // Before:
 * if (typeof value === 'object' && value !== null && 'property' in value && typeof value.property === 'string') {
 *   // use value.property
 * }
 * // After:
 * if (isIndexableObject(value) && typeof value.property === 'string') {
 *   // use value.property
 * }
 * ```
 */
export function isIndexableObject(value: unknown): value is Record<any, unknown> {
  return getType(value) === 'object'
}
