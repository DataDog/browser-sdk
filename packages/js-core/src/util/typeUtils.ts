/**
 * Similar to `typeof`, but distinguish plain objects from `null` and arrays
 *
 * @returns `'null'` for `null`, `'array'` for arrays, or the result of `typeof` for everything else.
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
 * Like `Partial<T>`, but applied recursively to all nested object properties.
 * Array element types are also made recursively partial.
 */
export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<RecursivePartial<U>>
    : T[P] extends object | undefined
      ? RecursivePartial<T[P]>
      : T[P]
}

/**
 * Checks whether a value can have properties. Use this when you have an unknown value and you want
 * to access its properties as unknown. This is a friendly solution for dealing with unknown objects
 * in TypeScript.
 *
 * This function is intended to be used on values that will be used as "plain objects", i.e. not
 * Array, Date, RegExp or other class instances. But it's safe to use on any value.
 *
 * @returns `true` if `value` is a non-null object that is not an array.
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

/**
 * Checks whether `value` is a valid percentage: a number between 0 and 100 inclusive.
 */
export function isPercentage(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 100
}

/**
 * Checks whether `value` can be used to match against a string: a string, a RegExp, or a
 * predicate function.
 */
export function isMatchOption(value: unknown): value is string | RegExp | ((value: string) => boolean) {
  return typeof value === 'string' || value instanceof RegExp || typeof value === 'function'
}
