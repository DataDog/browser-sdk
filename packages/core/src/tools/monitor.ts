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
    monitorError(e)
    
    const isServiceWorker = typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self;
    
    if (isServiceWorker &&
        e instanceof Error && 
        (e.message.includes('window is not defined') || 
         e.message.includes('document is not defined'))) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Service Worker environment: Ignored window/document reference error:', e.message);
      }
      return undefined;
    }
    
    if (!isServiceWorker) {
      throw e;
    }
    
    if (typeof console !== 'undefined' && console.error) {
      console.error('Error in Service Worker execution:', e);
    }
    return undefined;
  }
}

export function monitorError(e: unknown) {
  const isServiceWorker = typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self;
  const isWindowNotDefinedError = e instanceof Error && 
    (e.message.includes('window is not defined') || 
     e.message.includes('document is not defined'));
  
  if (isServiceWorker && isWindowNotDefinedError) {
    if (typeof console !== 'undefined') {
      console.warn('[Datadog] Browser SDK using window/document in Service Worker:', e);
    }
    
    if (onMonitorErrorCollected) {
      try {
        const simplifiedError = new Error(`Service Worker environment error: ${e.message}`);
        if (e.stack) {
          simplifiedError.stack = e.stack;
        }
        onMonitorErrorCollected(simplifiedError);
      } catch (innerError) {
        // If even this fails, just log it
        if (typeof console !== 'undefined') {
          console.error('[Datadog] Failed to collect monitor error:', innerError);
        }
      }
    }
    
    return;
  }
  
  displayIfDebugEnabled(e)
  if (onMonitorErrorCollected) {
    try {
      onMonitorErrorCollected(e)
    } catch (innerError) {
      displayIfDebugEnabled(innerError)
      
      if (typeof console !== 'undefined') {
        console.error('[Datadog] Error in error collection:', innerError);
      }
    }
  }
}

export function displayIfDebugEnabled(...args: any[]) {
  if (debugMode) {
    display.error('[MONITOR]', ...args)
  }
}
