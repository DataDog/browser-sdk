/* eslint-disable no-console */
/**
 * Keep references on console methods to avoid triggering patched behaviors
 *
 * NB: in some setup, console could already be patched by another SDK.
 * In this case, some display messages can be sent by the other SDK
 * but we should be safe from infinite loop nonetheless.
 */
export const display: Pick<typeof console, 'log' | 'warn' | 'error'> = {
  log: console.log,
  warn: console.warn,
  error: console.error,
}
