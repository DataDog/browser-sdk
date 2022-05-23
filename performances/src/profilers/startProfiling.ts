import type { Page } from 'puppeteer'
import type { ProfilingOptions, ProfilingResults } from '../types'
import { startNetworkProfiling } from './startNetworkProfiling'
import { startCPUProfiling } from './startCpuProfiling'
import { startMemoryProfiling } from './startMemoryProfiling'

export async function startProfiling(options: ProfilingOptions, page: Page) {
  const client = await page.target().createCDPSession()
  const stopCPUProfiling = await startCPUProfiling(options, client)
  const { stopMemoryProfiling, takeMemoryMeasurements } = await startMemoryProfiling(options, client)
  const stopNetworkProfiling = await startNetworkProfiling(options, client)

  return {
    takeMeasurements: takeMemoryMeasurements,
    stopProfiling: async (): Promise<ProfilingResults> => ({
      memory: await stopMemoryProfiling(),
      cpu: await stopCPUProfiling(),
      ...stopNetworkProfiling(),
    }),
  }
}
