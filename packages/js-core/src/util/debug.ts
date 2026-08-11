let debugMode = false

/**
 * Enables or disables debug mode globally.
 *
 * Debug mode is a process-wide toggle that SDKs check (via {@link getDebugMode}) to decide whether
 * to emit internal diagnostic logs to the console. It does not affect any data sent to Datadog.
 *
 * @param newDebugMode - `true` to enable debug mode, `false` to disable it.
 */
export function setDebugMode(newDebugMode: boolean) {
  debugMode = newDebugMode
}

/**
 * Returns whether debug mode is currently enabled (see {@link setDebugMode}).
 *
 * @returns `true` when debug mode is on.
 */
export function getDebugMode() {
  return debugMode
}
