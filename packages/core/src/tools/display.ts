/* eslint-disable no-console, local-rules/disallow-side-effects */
/**
 * Keep references on console methods to avoid triggering patched behaviors
 *
 * NB: in some setup, console could already be patched by another SDK.
 * In this case, some display messages can be sent by the other SDK
 * but we should be safe from infinite loop nonetheless.
 */

import { ConsoleApiName } from '../domain/console/consoleObservable'

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

display.debug = console.debug.bind(console)
display.log = console.log.bind(console)
display.info = console.info.bind(console)
display.warn = console.warn.bind(console)
display.error = console.error.bind(console)
