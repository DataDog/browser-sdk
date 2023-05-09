/* eslint-disable local-rules/disallow-side-effects */
/**
 * Keep references on console methods to avoid triggering patched behaviors
 *
 * NB: in some setup, console could already be patched by another SDK.
 * In this case, some display messages can be sent by the other SDK
 * but we should be safe from infinite loop nonetheless.
 */

export const ConsoleApiName = {
  log: 'log',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const

export type ConsoleApiName = (typeof ConsoleApiName)[keyof typeof ConsoleApiName]

interface Display {
  (api: ConsoleApiName, ...args: any[]): void
  debug: typeof console.debug
  log: typeof console.log
  info: typeof console.info
  warn: typeof console.warn
  error: typeof console.error
}

export const display: Display = (api, ...args) => {
  if (!Object.prototype.hasOwnProperty.call(ConsoleApiName, api)) {
    api = ConsoleApiName.log
  }
  display[api](...args)
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

display.debug = globalConsole.debug.bind(globalConsole)
display.log = globalConsole.log.bind(globalConsole)
display.info = globalConsole.info.bind(globalConsole)
display.warn = globalConsole.warn.bind(globalConsole)
display.error = globalConsole.error.bind(globalConsole)
