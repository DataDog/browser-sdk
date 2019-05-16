export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

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

export function cache<T>(fn: () => T, duration: number): () => T {
  let value: any
  let expired = true
  return () => {
    if (expired) {
      value = fn()
      expired = false
      setTimeout(() => (expired = true), duration)
    }
    return value
  }
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

export function getTimeSinceLoading() {
  return Math.floor(performance.now())
}

export function round(num: number, decimals: 0 | 1 | 2 | 3) {
  return +num.toFixed(decimals)
}

export function withSnakeCaseKeys(candidate: any): any {
  if (Array.isArray(candidate)) {
    return candidate.map((value: any) => withSnakeCaseKeys(value))
  }
  if (typeof candidate === 'object') {
    const result: any = {}
    Object.keys(candidate).forEach((key: string) => {
      result[toSnakeCase(key)] = withSnakeCaseKeys(candidate[key])
    })
    return result
  }
  return candidate
}

export function toSnakeCase(word: string) {
  return word
    .replace(
      /[A-Z]/g,
      (uppercaseLetter: string, index: number) => `${index !== 0 ? '_' : ''}${uppercaseLetter.toLowerCase()}`
    )
    .replace(/-/g, '_')
}
