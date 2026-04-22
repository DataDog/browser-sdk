import type { NetworkRequestResource } from '@datadog/core-next'

interface BufferedEntry {
  resource: NetworkRequestResource
  timestamp: number
}

class ResourceMatcher {
  private buffer = new Map<string, BufferedEntry[]>()
  private readonly TTL = 5_000

  add(resource: NetworkRequestResource): void {
    const key = resource.url
    if (!this.buffer.has(key)) {
      this.buffer.set(key, [])
    }
    this.buffer.get(key)!.push({ resource, timestamp: Date.now() })
    this.evict()
  }

  match(url: string, startTime: number): NetworkRequestResource | undefined {
    const entries = this.buffer.get(url)
    if (!entries || entries.length === 0) return undefined

    let bestIndex = 0
    let bestDelta = Math.abs(entries[0].resource.startTime - startTime)
    for (let i = 1; i < entries.length; i++) {
      const delta = Math.abs(entries[i].resource.startTime - startTime)
      if (delta < bestDelta) {
        bestDelta = delta
        bestIndex = i
      }
    }

    const matched = entries.splice(bestIndex, 1)[0]
    if (entries.length === 0) {
      this.buffer.delete(url)
    }
    return matched.resource
  }

  private evict(): void {
    const now = Date.now()
    for (const [url, entries] of this.buffer) {
      const filtered = entries.filter((e) => now - e.timestamp < this.TTL)
      if (filtered.length === 0) {
        this.buffer.delete(url)
      } else {
        this.buffer.set(url, filtered)
      }
    }
  }
}

export { ResourceMatcher }
