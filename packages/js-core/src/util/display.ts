/**
 * Keep references on console methods to avoid triggering patched behaviors
 *
 * NB: in some setup, console could already be patched by another SDK.
 * In this case, some display messages can be sent by the other SDK
 * but we should be safe from infinite loop nonetheless.
 */

/** Names of the console methods wrapped by {@link Display}. */
export const ConsoleApiName = {
  log: 'log',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const

/** Union of the console method names (`'log' | 'debug' | 'info' | 'warn' | 'error'`). */
export type ConsoleApiName = (typeof ConsoleApiName)[keyof typeof ConsoleApiName]

/** Console methods pre-bound to the original (unpatched) console implementation. */
export interface Display {
  debug: typeof console.debug
  log: typeof console.log
  info: typeof console.info
  warn: typeof console.warn
  error: typeof console.error
}

/**
 * When building JS bundles, some users might use a plugin[1] or configuration[2] to remove
 * "console.*" references. This causes some issue as we expect `console.*` to be defined.
 * As a workaround, let's use a variable alias, so those expressions won't be taken into account by
 * simple static analysis.
 *
 * [1]: https://babeljs.io/docs/babel-plugin-transform-remove-console/
 * [2]: https://github.com/terser/terser#compress-options (look for drop_console)
 */
export const globalConsole = console

/** The original (unpatched) console methods, captured at module load. */
export const originalConsoleMethods: Display = {
  log: globalConsole.log,
  debug: globalConsole.debug,
  info: globalConsole.info,
  warn: globalConsole.warn,
  error: globalConsole.error,
}

/**
 * Creates a {@link Display} bound to the original (unpatched) console methods, prefixing every
 * message with the given prefix.
 *
 * Capturing the original console methods up front avoids triggering behaviors added by another SDK
 * (or the host application) that may have patched `console.*` afterwards.
 *
 * @param prefix - String prepended to every logged message (e.g. to attribute output to an SDK).
 * @returns A {@link Display} whose methods forward to the original console methods.
 */
export function createDisplay(prefix: string): Display {
  return {
    debug: originalConsoleMethods.debug.bind(globalConsole, prefix),
    log: originalConsoleMethods.log.bind(globalConsole, prefix),
    info: originalConsoleMethods.info.bind(globalConsole, prefix),
    warn: originalConsoleMethods.warn.bind(globalConsole, prefix),
    error: originalConsoleMethods.error.bind(globalConsole, prefix),
  }
}
