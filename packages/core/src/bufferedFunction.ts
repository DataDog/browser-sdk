const DEFAULT_LIMIT = 10_000

interface BufferedFunction<A extends any[]> {
  (...args: A): void
  enable(): void
}

export function createBufferedFunction<A extends any[]>(fn: (...args: A) => void, limit: number = DEFAULT_LIMIT) {
  let enabled = false
  const buffer: A[] = []

  const wrapper = ((...args: A) => {
    if (enabled) {
      fn(...args)
    } else {
      buffer.push(args)
      const overlimitCount = buffer.length - limit
      if (overlimitCount > 0) {
        buffer.splice(0, overlimitCount)
      }
    }
  }) as BufferedFunction<A>

  wrapper.enable = () => {
    enabled = true
    buffer.forEach((arg) => fn(...arg))
    buffer.length = 0
  }

  return wrapper
}
