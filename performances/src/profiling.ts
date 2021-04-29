import { CDPSession, Page, Protocol } from 'puppeteer'
import { ProfilingResults, ProfilingOptions } from './types'

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

async function startCPUProfiling(options: ProfilingOptions, client: CDPSession) {
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

async function startMemoryProfiling(options: ProfilingOptions, client: CDPSession) {
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

async function startNetworkProfiling(options: ProfilingOptions, client: CDPSession) {
  await client.send('Network.enable')
  options.proxy.stats.reset()
  // Twitter is using a service worker intercepting our requests
  await client.send('Network.setBypassServiceWorker', { bypass: true })
  let sdkDownload = 0

  const sdkRequestIds = new Set<string>()
  const typeByRequestId = new Map<string, string>()
  const appByType = new Map<string, number>()

  const requestListener = ({ request, requestId }: Protocol.Network.RequestWillBeSentEvent) => {
    if (isSdkBundleUrl(options, request.url)) {
      sdkRequestIds.add(requestId)
    }
  }

  const responseListener = ({ type, requestId }: Protocol.Network.ResponseReceivedEvent) => {
    typeByRequestId.set(requestId, type)
  }

  const loadingFinishedListener = ({ requestId, encodedDataLength }: Protocol.Network.LoadingFinishedEvent) => {
    if (sdkRequestIds.has(requestId)) {
      sdkDownload += encodedDataLength
    } else {
      const type = typeByRequestId.get(requestId)!
      appByType.set(type, (appByType.get(type) || 0) + encodedDataLength)
    }
  }

  client.on('Network.requestWillBeSent', requestListener)
  client.on('Network.responseReceived', responseListener)
  client.on('Network.loadingFinished', loadingFinishedListener)
  return () => {
    client.off('Network.requestWillBeSent', requestListener)
    client.off('Network.responseReceived', responseListener)
    client.off('Network.loadingFinishedListener', loadingFinishedListener)

    return {
      upload: options.proxy.stats.getStatsByHost(),
      download: {
        sdk: sdkDownload,
        appByType: Array.from(appByType, ([type, responsesSize]) => ({ type, responsesSize })),
      },
    }
  }
}

function isSdkBundleUrl(options: ProfilingOptions, url: string) {
  return url === options.bundleUrl
}

function* iterNodes<N extends { children?: N[] }>(root: N): Generator<N> {
  yield root
  if (root.children) {
    for (const child of root.children) {
      yield* iterNodes(child)
    }
  }
}
