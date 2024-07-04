import type { Page } from 'puppeteer'
import type { ProfilingOptions, ProfilingResults } from '../profiling.types'
import { startNetworkProfiling } from './startNetworkProfiling'
import { startCPUProfiling } from './startCpuProfiling'
import { startMemoryProfiling } from './startMemoryProfiling'

export async function startProfiling(options: ProfilingOptions, page: Page) {
  const client = await page.target().createCDPSession()
  const { stopCPUProfiling, takeCPUMeasurements } = await startCPUProfiling(options, client)
  const { stopMemoryProfiling, takeMemoryMeasurements } = await startMemoryProfiling(options, client)
  const stopNetworkProfiling = await startNetworkProfiling(options, client)

  return {
    takeMeasurements: async () => {
      await takeCPUMeasurements()
      await takeMemoryMeasurements()
    },
    stopProfiling: async (): Promise<ProfilingResults> => ({
      memory: await stopMemoryProfiling(),
      cpu: await stopCPUProfiling(),
      ...stopNetworkProfiling(),
    }),
  }
}
