/* eslint-disable local-rules/disallow-side-effects */
/**
 * Keep references on console methods to avoid triggering patched behaviors
 *
 * NB: in some setup, console could already be patched by another SDK.
 * In this case, some display messages can be sent by the other SDK
 * but we should be safe from infinite loop nonetheless.
 */

const ConsoleApiName = {
  log: 'log',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const

type ConsoleApiName = (typeof ConsoleApiName)[keyof typeof ConsoleApiName]

let debugMode = false

/**
 * Enables or disables debug-mode logging globally.
 *
 * This is a global toggle: when enabled, every `Display`'s {@link Display.ifDebugEnabled} methods
 * emit to the console; otherwise they are silent. The always-on methods are unaffected.
 *
 * @param newDebugMode - `true` to emit `ifDebugEnabled` messages, `false` to stay silent.
 */
export function setDebugMode(newDebugMode: boolean) {
  debugMode = newDebugMode
}

/** A set of console methods, pre-bound to the original (unpatched) console implementation. */
interface ConsoleMethods {
  debug: typeof console.debug
  log: typeof console.log
  info: typeof console.info
  warn: typeof console.warn
  error: typeof console.error
}

/**
 * Console methods pre-bound to the original (unpatched) console, plus a debug-gated variant.
 *
 * The top-level methods always emit. The {@link Display.ifDebugEnabled} methods mirror them but
 * only emit when debug mode is enabled (see {@link setDebugMode}), so callers can choose per call.
 */
export interface Display extends ConsoleMethods {
  /** Same console methods, but each only emits when debug mode is enabled. */
  ifDebugEnabled: ConsoleMethods
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
const globalConsole = console

// Exported (but intentionally not re-exported from the `util` barrel, so it stays out of the public
// API) as a test seam: `createDisplay` reads these at call time, so a spec can spy on them.
export const originalConsoleMethods = {} as ConsoleMethods
Object.keys(ConsoleApiName).forEach((name) => {
  originalConsoleMethods[name as ConsoleApiName] = globalConsole[name as ConsoleApiName]
})

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
  const display = {
    debug: originalConsoleMethods.debug.bind(globalConsole, prefix),
    log: originalConsoleMethods.log.bind(globalConsole, prefix),
    info: originalConsoleMethods.info.bind(globalConsole, prefix),
    warn: originalConsoleMethods.warn.bind(globalConsole, prefix),
    error: originalConsoleMethods.error.bind(globalConsole, prefix),
  } as Display

  // Delegate through the display's own methods (rather than the bound consts) so an override of,
  // say, `display.error` is respected by `display.ifDebugEnabled.error` too.
  display.ifDebugEnabled = {
    debug: (...args) => emitIfDebugEnabled(display.debug, args),
    log: (...args) => emitIfDebugEnabled(display.log, args),
    info: (...args) => emitIfDebugEnabled(display.info, args),
    warn: (...args) => emitIfDebugEnabled(display.warn, args),
    error: (...args) => emitIfDebugEnabled(display.error, args),
  }

  return display
}

function emitIfDebugEnabled(method: (...args: any[]) => void, args: any[]) {
  if (debugMode) {
    method(...args)
  }
}
