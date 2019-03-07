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
