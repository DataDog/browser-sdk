export interface SerializationMetric {
  count: number
  max: number
  sum: number
}

export interface SerializationStats {
  cssText: SerializationMetric
  serializationDuration: SerializationMetric
}

export function createSerializationStats(): SerializationStats {
  return {
    cssText: {
      count: 0,
      max: 0,
      sum: 0,
    },
    serializationDuration: {
      count: 0,
      max: 0,
      sum: 0,
    },
  }
}

export function updateSerializationStats(
  stats: SerializationStats,
  metric: keyof SerializationStats,
  value: number
): void {
  stats[metric].count += 1
  stats[metric].max = Math.max(stats[metric].max, value)
  stats[metric].sum += value
}

export function aggregateSerializationStats(aggregateStats: SerializationStats, stats: SerializationStats) {
  for (const metric of ['cssText', 'serializationDuration'] as const) {
    aggregateStats[metric].count += stats[metric].count
    aggregateStats[metric].max = Math.max(aggregateStats[metric].max, stats[metric].max)
    aggregateStats[metric].sum += stats[metric].sum
  }
}
