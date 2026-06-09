import type { Display } from './util'

/** An isolated monitor, as returned by {@link createMonitor}. */
export interface Monitor {
  /**
   * TypeScript method decorator that routes a class method through {@link Monitor.monitor}, so any
   * error it throws is caught and reported instead of propagating to the caller.
   *
   * When to use: prefer this for **class methods** that are entry points from outside the SDK
   * (public API methods, lifecycle callbacks) where an internal error must never reach the host
   * application. For standalone functions or inline blocks, use {@link Monitor.monitor} or
   * {@link Monitor.callMonitored} instead.
   *
   * @param descriptor - Property descriptor of the decorated method; its `value` is replaced with
   * the monitored wrapper.
   *
   * @example
   * ```ts
   * class Logger {
   *   @monitored
   *   logImplementation(message: string) {
   *     // if this throws, the error is collected and reported, not propagated to the caller
   *   }
   * }
   * ```
   */
  monitored: <T extends (...params: any[]) => unknown>(
    _: any,
    __: string,
    descriptor: TypedPropertyDescriptor<T>
  ) => void

  /**
   * Wraps a function so that, when called, any thrown error is caught and reported (via the error
   * callback) instead of propagating. The wrapper keeps the same signature as the input function.
   *
   * When to use: prefer this when you need a **reusable monitored callback** to hand to something
   * that invokes it later, possibly multiple times — an event listener, `setTimeout`, an observable
   * subscription. For a one-shot inline block, use {@link Monitor.callMonitored} instead.
   *
   * @param fn - The function to wrap.
   * @returns A function with the same signature that never throws (errors are collected instead).
   *
   * @example
   * ```ts
   * element.addEventListener(
   *   'click',
   *   monitor((event) => {
   *     // handler errors are collected instead of surfacing to the page
   *   })
   * )
   * ```
   */
  monitor: <T extends (...args: any[]) => unknown>(fn: T) => T

  /**
   * Invokes a function with error handling: returns its result, or reports the error (via the error
   * callback) and returns `undefined` if it throws.
   *
   * When to use: prefer this for a **one-off inline block** you want to run immediately under error
   * protection. If you instead need a callback to pass elsewhere and reuse, wrap it once with
   * {@link Monitor.monitor}.
   *
   * @param fn - The function to invoke.
   * @param context - `this` value to invoke `fn` with (optional for context-free functions).
   * @param args - Arguments to invoke `fn` with (optional for context-free functions).
   * @returns The result of `fn`, or `undefined` if it threw.
   *
   * @example
   * ```ts
   * callMonitored(() => {
   *   const stackTrace = computeStackTrace(error)
   *   reportStackTrace(stackTrace)
   * })
   * ```
   */
  callMonitored: {
    <T extends (...args: any[]) => unknown>(
      fn: T,
      context: ThisParameterType<T>,
      args: Parameters<T>
    ): ReturnType<T> | undefined
    <T extends (this: void) => unknown>(fn: T): ReturnType<T> | undefined
  }

  /**
   * Reports an error directly: logs it to the console when debug mode is enabled, then forwards it
   * to the error callback. Used internally by {@link Monitor.monitor}/{@link Monitor.callMonitored},
   * but can also be called to report an error caught elsewhere.
   *
   * When to use: prefer this when you **already hold an error value** and only need to route it to
   * telemetry — e.g. a promise rejection, which `monitor`/`callMonitored` do not catch (they only
   * handle synchronous throws).
   *
   * @param e - The error to report.
   *
   * @example
   * ```ts
   * // route a promise rejection to telemetry
   * doAsyncThing().catch(monitorError)
   * ```
   */
  monitorError: (e: unknown) => void
}

/**
 * Creates an isolated monitor with its own error-collection callback and display.
 *
 * Each consumer (SDK) should create its own monitor so that error-collection callbacks do not
 * clobber each other when several SDKs share the same `@datadog/js-core/monitor` module instance.
 *
 * @param display - {@link Display} used for debug logging (see `createDisplay` in
 * `@datadog/js-core/util`). Lets the consumer control the log prefix and console binding. Debug
 * output is gated by the display's `ifDebugEnabled` facet (toggled via `setDebugMode`).
 * @param onMonitorErrorCollected - Callback invoked with each error caught by the monitor (e.g. to
 * forward it to telemetry). Fixed for the lifetime of the monitor.
 * @returns A {@link Monitor}.
 */
export function createMonitor(display: Display, onMonitorErrorCollected: (error: unknown) => void): Monitor {
  function monitored<T extends (...params: any[]) => unknown>(
    _: any,
    __: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!
    descriptor.value = function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
      return monitor(originalMethod).apply(this, args) as ReturnType<T>
    } as T
  }

  function monitor<T extends (...args: any[]) => unknown>(fn: T): T {
    return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
      return callMonitored(fn, this, args)
    } as unknown as T // consider output type has input type
  }

  function callMonitored<T extends (...args: any[]) => unknown>(
    fn: T,
    context: ThisParameterType<T>,
    args: Parameters<T>
  ): ReturnType<T> | undefined
  function callMonitored<T extends (this: void) => unknown>(fn: T): ReturnType<T> | undefined
  function callMonitored<T extends (...args: any[]) => unknown>(
    fn: T,
    context?: any,
    args?: any
  ): ReturnType<T> | undefined {
    try {
      return fn.apply(context, args) as ReturnType<T>
    } catch (e) {
      monitorError(e)
    }
  }

  function monitorError(e: unknown) {
    display.ifDebugEnabled.error('[MONITOR]', e)
    try {
      onMonitorErrorCollected(e)
    } catch (e) {
      display.ifDebugEnabled.error('[MONITOR]', e)
    }
  }

  return {
    monitored,
    monitor,
    callMonitored,
    monitorError,
  }
}
