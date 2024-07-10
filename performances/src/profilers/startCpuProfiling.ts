import type { CDPSession } from 'puppeteer'
import type { ProfilingOptions } from '../profiling.types'
import { isSdkBundleUrl } from './profilingUtils'

export async function startCPUProfiling(options: ProfilingOptions, client: CDPSession) {
  await client.send('Profiler.enable')
  await client.send('Profiler.start')

  let totalConsumption = 0
  let sdkConsumption = 0

  async function stopAndAddProfile() {
    const { profile } = await client.send('Profiler.stop')

    const timeDeltaForNodeId = new Map<number, number>()

    for (let index = 0; index < profile.samples!.length; index += 1) {
      const nodeId = profile.samples![index]
      timeDeltaForNodeId.set(nodeId, (timeDeltaForNodeId.get(nodeId) || 0) + profile.timeDeltas![index])
    }

    for (const node of profile.nodes) {
      const consumption = timeDeltaForNodeId.get(node.id) || 0
      totalConsumption += consumption
      if (isSdkBundleUrl(options, node.callFrame.url)) {
        sdkConsumption += consumption
      }
    }
  }

  return {
    takeCPUMeasurements: async () => {
      // We need to restart profiling at each "measurement" because the running profile gets reset
      // on each navigation.
      await stopAndAddProfile()
      await client.send('Profiler.start')
    },
    stopCPUProfiling: async () => {
      await stopAndAddProfile()
      return { total: totalConsumption, sdk: sdkConsumption }
    },
  }
}
