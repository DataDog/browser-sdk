import type { CDPSession } from 'puppeteer'
import type { ProfilingOptions } from '../types'
import { isSdkBundleUrl } from '../utils'

export async function startCPUProfiling(options: ProfilingOptions, client: CDPSession) {
  await client.send('Profiler.enable')
  await client.send('Profiler.start')

  return async () => {
    const { profile } = await client.send('Profiler.stop')

    const timeDeltaForNodeId = new Map<number, number>()

    for (let index = 0; index < profile.samples!.length; index += 1) {
      const nodeId = profile.samples![index]
      timeDeltaForNodeId.set(nodeId, (timeDeltaForNodeId.get(nodeId) || 0) + profile.timeDeltas![index])
    }

    let totalConsumption = 0
    let sdkConsumption = 0
    for (const node of profile.nodes) {
      const consumption = timeDeltaForNodeId.get(node.id) || 0
      totalConsumption += consumption
      if (isSdkBundleUrl(options, node.callFrame.url)) {
        sdkConsumption += consumption
      }
    }

    return { total: totalConsumption, sdk: sdkConsumption }
  }
}
