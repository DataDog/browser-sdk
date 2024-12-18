/**
 * @returns true if target[method] is instrumented by action. (e.g. via
 * instrumentMethod())
 */
export function instrumentationIsAddedTo<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET & string>(
  target: TARGET,
  method: METHOD,
  action: () => void
): boolean {
  const before = target[method]
  action()
  return target[method] !== before
}
