import type { CDPSession } from '@playwright/test'

export async function startMemoryProfiling(client: CDPSession) {
  await client.send('HeapProfiler.enable')
  await client.send('HeapProfiler.startSampling', {
    // Set a low sampling interval to have more precise measurement
    samplingInterval: 100,
  })

  const measurements: Array<{ totalConsumption: number }> = []

  return {
    takeMemoryMeasurements: async () => {
      await client.send('HeapProfiler.collectGarbage')
      const { profile } = await client.send('HeapProfiler.getSamplingProfile')

      const sizeForNodeId = new Map<number, number>()

      for (const sample of profile.samples) {
        sizeForNodeId.set(sample.nodeId, (sizeForNodeId.get(sample.nodeId) || 0) + sample.size)
      }

      let totalConsumption = 0
      for (const node of iterNodes(profile.head)) {
        const consumption = sizeForNodeId.get(node.id) || 0
        totalConsumption += consumption
      }
      measurements.push({ totalConsumption })
    },

    stopMemoryProfiling: async () => {
      await client.send('HeapProfiler.stopSampling')

      measurements.sort((a, b) => a.totalConsumption - b.totalConsumption)
      const { totalConsumption } = measurements[Math.floor(measurements.length / 2)]
      return totalConsumption
    },
  }
}

function* iterNodes<N extends { children?: N[] }>(root: N): Generator<N> {
  yield root
  if (root.children) {
    for (const child of root.children) {
      yield* iterNodes(child)
    }
  }
}
