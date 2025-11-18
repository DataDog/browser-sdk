import { HostMetricsTimeSeries } from '../types/data'

// Simple seeded random number generator for consistent metrics per host
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 2147483648
    return state / 2147483648
  }
}

export function generateHostMetrics(hostId: string, dataPoints: number = 50): HostMetricsTimeSeries {
  // Use host ID as seed for consistent metrics per host
  const seed = hostId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const random = seededRandom(seed)

  const baseTimestamp = Date.now() - dataPoints * 60000 // Start from 'dataPoints' minutes ago

  // Generate metrics with some variation but consistent per host
  const generateMetricData = (baseValue: number, variance: number) => {
    const points = []
    let currentValue = baseValue

    for (let i = 0; i < dataPoints; i++) {
      // Add some random walk behavior
      const change = (random() - 0.5) * variance
      currentValue = Math.max(0, Math.min(100, currentValue + change))

      points.push({
        timestamp: baseTimestamp + i * 60000, // 1 minute intervals
        value: Math.round(currentValue),
      })
    }

    return points
  }

  // Generate different patterns for different metrics
  const cpuBase = 30 + random() * 40 // 30-70% base
  const memoryBase = 40 + random() * 40 // 40-80% base
  const diskBase = 20 + random() * 50 // 20-70% base
  const networkBase = 10 + random() * 60 // 10-70 Mbps base

  return {
    cpu: generateMetricData(cpuBase, 10),
    memory: generateMetricData(memoryBase, 8),
    disk: generateMetricData(diskBase, 5),
    network: generateMetricData(networkBase, 15),
  }
}
