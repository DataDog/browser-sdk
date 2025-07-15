export interface SerializationMetric {
  count: number
  max: number
  sum: number
}

export interface SerializationStats {
  cssText: SerializationMetric
}

export function createSerializationStats(): SerializationStats {
  return {
    cssText: {
      count: 0,
      max: 0,
      sum: 0,
    },
  }
}

export function updateCssTextSerializationStats(stats: SerializationStats, value: number): void {
  stats.cssText.count += 1
  stats.cssText.max = Math.max(stats.cssText.max, value)
  stats.cssText.sum += value
}

export function aggregateSerializationStats(aggregateStats: SerializationStats, stats: SerializationStats) {
  aggregateStats.cssText.count += stats.cssText.count
  aggregateStats.cssText.max = Math.max(aggregateStats.cssText.max, stats.cssText.max)
  aggregateStats.cssText.sum += stats.cssText.sum
}
