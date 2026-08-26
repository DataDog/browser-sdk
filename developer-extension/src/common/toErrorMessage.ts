// Turns an unknown caught value into a displayable string: an Error's message, or the value coerced
// to a string. One place to change how errors read across the panel.
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
