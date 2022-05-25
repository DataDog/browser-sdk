import { ConsoleApiName, display } from '../display'

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
  descriptor.value = function (this: any, ...args: Parameters<T>) {
    const decorated = onMonitorErrorCollected ? monitor(originalMethod) : originalMethod
    return decorated.apply(this, args) as ReturnType<T>
  } as T
}

export function monitor<T extends (...args: any[]) => any>(fn: T): T {
  return function (this: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return callMonitored(fn, this, arguments as unknown as Parameters<T>)
  } as unknown as T // consider output type has input type
}

export function callMonitored<T extends (...args: any[]) => any>(
  fn: T,
  context: ThisParameterType<T>,
  args: Parameters<T>
): ReturnType<T> | undefined
export function callMonitored<T extends (this: void) => any>(fn: T): ReturnType<T> | undefined
export function callMonitored<T extends (...args: any[]) => any>(
  fn: T,
  context?: any,
  args?: any
): ReturnType<T> | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return fn.apply(context, args)
  } catch (e) {
    displayIfDebugEnabled(ConsoleApiName.error, e)
    if (onMonitorErrorCollected) {
      try {
        onMonitorErrorCollected(e)
      } catch (e) {
        displayIfDebugEnabled(ConsoleApiName.error, e)
      }
    }
  }
}

export function displayIfDebugEnabled(api: ConsoleApiName, ...args: any[]) {
  if (debugMode) {
    display(api, '[MONITOR]', ...args)
  }
}
