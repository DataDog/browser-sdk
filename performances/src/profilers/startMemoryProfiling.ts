import type { CDPSession } from 'puppeteer'
import { isSdkBundleUrl } from '../utils'
import type { ProfilingOptions } from '../types'

export async function startMemoryProfiling(options: ProfilingOptions, client: CDPSession) {
  await client.send('HeapProfiler.enable')
  await client.send('HeapProfiler.startSampling', {
    // Set a low sampling interval to have more precise measurement
    samplingInterval: 100,
  })

  const measurements: Array<{ sdkConsumption: number; totalConsumption: number }> = []

  return {
    takeMemoryMeasurements: async () => {
      await client.send('HeapProfiler.collectGarbage')
      const { profile } = await client.send('HeapProfiler.getSamplingProfile')

      const sizeForNodeId = new Map<number, number>()

      for (const sample of profile.samples) {
        sizeForNodeId.set(sample.nodeId, (sizeForNodeId.get(sample.nodeId) || 0) + sample.size)
      }

      let totalConsumption = 0
      let sdkConsumption = 0
      for (const node of iterNodes(profile.head)) {
        const consumption = sizeForNodeId.get(node.id) || 0
        totalConsumption += consumption
        if (isSdkBundleUrl(options, node.callFrame.url)) {
          sdkConsumption += consumption
        }
      }
      measurements.push({ totalConsumption, sdkConsumption })
    },

    stopMemoryProfiling: async () => {
      await client.send('HeapProfiler.stopSampling')

      measurements.sort((a, b) => a.sdkConsumption - b.sdkConsumption)
      const { sdkConsumption, totalConsumption } = measurements[Math.floor(measurements.length / 2)]
      return { total: totalConsumption, sdk: sdkConsumption }
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
