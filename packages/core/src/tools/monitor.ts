import { display } from './display'

let onMonitorErrorCollected: undefined | ((error: unknown) => void)
let debugMode = false

export function startMonitorErrorCollection(newOnMonitorErrorCollected: (error: unknown) => void) {
  onMonitorErrorCollected = newOnMonitorErrorCollected
}

export function setDebugMode(newDebugMode: boolean) {
  debugMode = newDebugMode
}

export function resetMonitor() {
  onMonitorErrorCollected = undefined
  debugMode = false
}

export function monitored<T extends (...params: any[]) => unknown>(
  _: any,
  __: string,
  descriptor: TypedPropertyDescriptor<T>
) {
  const originalMethod = descriptor.value!
  descriptor.value = function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    const decorated = onMonitorErrorCollected ? monitor(originalMethod) : originalMethod
    return decorated.apply(this, args) as ReturnType<T>
  } as T
}

export function monitor<T extends (...args: any[]) => unknown>(fn: T): T {
  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    return callMonitored(fn, this, args)
  } as unknown as T // consider output type has input type
}

export function callMonitored<T extends (...args: any[]) => unknown>(
  fn: T,
  context: ThisParameterType<T>,
  args: Parameters<T>
): ReturnType<T> | undefined
export function callMonitored<T extends (this: void) => unknown>(fn: T): ReturnType<T> | undefined
export function callMonitored<T extends (...args: any[]) => unknown>(
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

export function monitorError(e: unknown) {
  displayIfDebugEnabled(e)
  if (onMonitorErrorCollected) {
    try {
      onMonitorErrorCollected(e)
    } catch (e) {
      displayIfDebugEnabled(e)
    }
  }
}

export function displayIfDebugEnabled(...args: unknown[]) {
  if (debugMode) {
    display.error('[MONITOR]', ...args)
  }
}
