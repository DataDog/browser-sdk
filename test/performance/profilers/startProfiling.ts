import type { CDPSession, Page } from '@playwright/test'
import type { Metrics } from '../profiling.type'
import { startCPUProfiling } from './startCpuProfiling'
import { startMemoryProfiling } from './startMemoryProfiling'
import { startWebVitalsProfiling } from './startWebVitalsProfiling'
import { startNetworkProfiling } from './startNetworkProfiling'

export async function startProfiling(page: Page, cdpSession: CDPSession) {
  const { stopCPUProfiling, takeCPUMeasurements } = await startCPUProfiling(cdpSession)
  const { stopMemoryProfiling, takeMemoryMeasurements } = await startMemoryProfiling(cdpSession)
  const { stopNetworkProfiling } = startNetworkProfiling(page)
  const { stopWebVitalsProfiling } = await startWebVitalsProfiling(page)

  return {
    takeMeasurements: async () => {
      await takeCPUMeasurements()
      await takeMemoryMeasurements()
    },
    stopProfiling: async (): Promise<Metrics> => ({
      memory: await stopMemoryProfiling(),
      cpu: await stopCPUProfiling(),
      ...stopNetworkProfiling(),
      ...(await stopWebVitalsProfiling()),
    }),
  }
}
