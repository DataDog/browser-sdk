/**
 * Generates a random UUID v4 string.
 *
 * Used to identify entities (sessions, views, errors, operations, ...) with an identifier that is
 * unique enough for telemetry purposes, without relying on `crypto.randomUUID` which is not
 * available in every environment (e.g. non-secure contexts).
 *
 * Adapted from https://gist.github.com/jed/982883
 *
 * @param placeholder - Internal recursion parameter; omit it, it is only used by the function
 * itself while building the UUID.
 * @returns A UUID v4 string, e.g. `"110ec58a-a0f2-4ac4-8393-c866d813b8d1"`.
 */
export function generateUUID(placeholder?: string): string {
  return placeholder
    ? // eslint-disable-next-line no-bitwise
      (parseInt(placeholder, 10) ^ ((Math.random() * 16) >> (parseInt(placeholder, 10) / 4))).toString(16)
    : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID)
}
