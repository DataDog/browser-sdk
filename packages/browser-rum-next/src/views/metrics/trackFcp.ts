const MAX_FCP_TIME = 600000 // 10 minutes

export interface FcpTracker {
  process(entry: { name: string; startTime: number }): void
  get(): number | undefined
}

export function trackFcp(): FcpTracker {
  let value: number | undefined

  return {
    process(entry: { name: string; startTime: number }): void {
      if (value !== undefined) {
        return
      }
      if (entry.name !== 'first-contentful-paint') {
        return
      }
      if (entry.startTime > MAX_FCP_TIME) {
        return
      }
      value = entry.startTime
    },

    get(): number | undefined {
      return value
    },
  }
}
