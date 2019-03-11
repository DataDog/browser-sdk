// tslint:disable-next-line ban-types
export function throttle<T extends Function>(fn: T, wait: number): T {
  let lastCall = 0
  return (function(this: any) {
    const now = new Date().getTime()
    if (lastCall === 0 || lastCall + wait <= now) {
      lastCall = now
      return fn.apply(this, arguments)
    }
    return
  } as unknown) as T // consider output type has input type
}

// tslint:disable-next-line ban-types
export function cache<T extends Function>(fn: T, duration: number): T {
  let value: any
  let expired = true
  return (function(this: any) {
    if (expired) {
      value = fn()
      expired = false
      setTimeout(() => (expired = true), duration)
    }
    return value
  } as unknown) as T // consider output type has input type
}

/**
 * UUID v4
 * from https://gist.github.com/jed/982883
 */
export function generateUUID(placeholder?: any): string {
  return placeholder
    ? // tslint:disable-next-line no-bitwise
      (placeholder ^ ((Math.random() * 16) >> (placeholder / 4))).toString(16)
    : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID)
}
