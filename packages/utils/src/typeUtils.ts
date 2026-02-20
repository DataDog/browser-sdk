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
