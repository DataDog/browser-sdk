import { createDisplay, getDebugMode } from './util'
import type { Display } from './util'

/** An isolated monitor, as returned by {@link createMonitor}. */
export interface Monitor {
  /**
   * TypeScript method decorator that routes a class method through {@link Monitor.monitor}, so any
   * error it throws is caught and reported instead of propagating to the caller. Apply it as
   * `@monitored` on the method (it replaces the method's descriptor value with the monitored
   * wrapper).
   *
   * When to use: prefer this for **class methods** that are entry points from outside the SDK
   * (public API methods, lifecycle callbacks) where an internal error must never reach the host
   * application. For standalone functions or inline blocks, use {@link Monitor.monitor} or
   * {@link Monitor.callMonitored} instead.
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
 * output is only emitted when debug mode is enabled (see `setDebugMode`/`getDebugMode`).
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
    descriptor.value = monitor(descriptor.value!)
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
    const displayIfDebugEnabled = (e: unknown) => {
      if (getDebugMode()) {
        display.error('[MONITOR]', e)
      }
    }

    displayIfDebugEnabled(e)
    try {
      onMonitorErrorCollected(e)
    } catch (e) {
      displayIfDebugEnabled(e)
    }
  }

  return {
    monitored,
    monitor,
    callMonitored,
    monitorError,
  }
}

// --- Global monitor -----------------------------------------------------------

/**
 * Display used by the global monitor. Debug output is only emitted when
 * debug mode is enabled (see {@link setDebugMode}/{@link getDebugMode}); the prefix is cosmetic.
 */
// eslint-disable-next-line local-rules/disallow-side-effects
const monitorDisplay = createDisplay('Datadog SDK:')

/**
 * Holds the error-collection callback registered by the SDK that claimed the global monitor.
 *
 * `undefined` until {@link startMonitorErrorCollection} is called. Kept in a mutable holder (rather
 * than passed directly to {@link createMonitor}) so the callback can be wired lazily during SDK
 * init while the monitor functions themselves are usable from import time.
 */
let onMonitorErrorCollected: ((error: unknown) => void) | undefined

// eslint-disable-next-line local-rules/disallow-side-effects
const globalMonitor = createMonitor(monitorDisplay, (error) => onMonitorErrorCollected?.(error))

/**
 * TypeScript method decorator backed by the **global monitor**. See {@link Monitor.monitored} for
 * semantics and usage.
 *
 * @param _ - The class prototype (instance member) or constructor (static member) owning the
 * decorated method.
 * @param __ - The name of the decorated method.
 * @param descriptor - The property descriptor of the method; its `value` is replaced with the
 * monitored wrapper.
 * @returns void; replaces the method's descriptor value in place.
 */
export const monitored = globalMonitor.monitored

/**
 * Function wrapper backed by the **global monitor**. See {@link Monitor.monitor} for semantics and
 * usage.
 *
 * @param fn - The function to wrap.
 * @returns A function with the same signature as `fn` that never throws (errors are collected
 * instead).
 */
export const monitor = globalMonitor.monitor

/**
 * Invoke-with-error-handling backed by the **global monitor**. See {@link Monitor.callMonitored}
 * for semantics and usage.
 *
 * @param fn - The function to invoke.
 * @param context - `this` value to invoke `fn` with (optional for context-free functions).
 * @param args - Arguments to invoke `fn` with (optional for context-free functions).
 * @returns The result of `fn`, or `undefined` if it threw.
 */
export const callMonitored = globalMonitor.callMonitored

/**
 * Direct error reporter backed by the **global monitor**. See {@link Monitor.monitorError} for
 * semantics and usage.
 *
 * @param e - The error to report.
 * @returns void; logs and forwards the error to the registered callback.
 */
export const monitorError = globalMonitor.monitorError

/**
 * Registers the error-collection callback for the global monitor.
 *
 * **First-wins**: the first call claims the sink for the lifetime of the js-core module instance;
 * subsequent calls are ignored and return `false`. This avoids a late-loading SDK silently
 * hijacking an earlier SDK's internal-error telemetry.
 *
 * **Limitation / trade-off**: when several SDKs share the same js-core module instance, only the
 * first SDK's callback receives internal errors caught by the global monitor — including errors
 * raised by shared code (e.g. transport) on behalf of a later-loading SDK. Those errors are
 * attributed to the first SDK's telemetry. There is no per-SDK attribution today; this is the
 * pragmatic simplification chosen over threading monitor functions through every call site. We
 * can revisit a per-SDK strategy (e.g. context-based attribution) in the future.
 *
 * @returns `true` if the callback was registered, `false` if a callback was already registered.
 */
export function startMonitorErrorCollection(onMonitorErrorCollectedCallback: (error: unknown) => void): boolean {
  if (onMonitorErrorCollected) {
    return false
  }
  onMonitorErrorCollected = onMonitorErrorCollectedCallback
  return true
}

/**
 * Clears the error-collection callback registered by {@link startMonitorErrorCollection}.
 *
 * This is the production detach path: after it returns, errors caught by the global monitor are
 * dropped (no longer forwarded to telemetry). Intended for SDK teardown (`stop()`); does not
 * affect debug mode. Tests that need a full reset should call this followed by
 * `setDebugMode(false)`.
 */
export function stopMonitorErrorCollection() {
  onMonitorErrorCollected = undefined
}
