/**
 * Keep references on console methods to avoid triggering patched behaviors
 */
export const display: Pick<typeof console, 'log' | 'warn' | 'error'> = {
  log: console.log,
  warn: console.warn,
  error: console.error,
}
