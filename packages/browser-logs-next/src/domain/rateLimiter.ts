const DEFAULT_LIMIT = 200
const WINDOW_MS = 60_000 // 1 minute

interface RateLimiter {
  isLimitReached(status: string): boolean
}

function createRateLimiter(limit: number = DEFAULT_LIMIT): RateLimiter {
  const counts = new Map<string, { count: number; windowStart: number }>()

  return {
    isLimitReached(status: string): boolean {
      const now = Date.now()
      let entry = counts.get(status)

      if (!entry || now - entry.windowStart >= WINDOW_MS) {
        entry = { count: 0, windowStart: now }
        counts.set(status, entry)
      }

      entry.count++
      return entry.count > limit
    },
  }
}

export { createRateLimiter }
export type { RateLimiter }
