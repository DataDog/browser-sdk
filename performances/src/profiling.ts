import { CDPSession, Page, Protocol } from 'puppeteer'

export async function startProfiling(page: Page) {
  const client = await page.target().createCDPSession()
  const stopCPUProfiling = await startCPUProfiling(client)
  const { stopMemoryProfiling, takeMemoryMeasurements } = await startMemoryProfiling(client)
  const stopNetworkProfiling = await startNetworkProfiling(client)

  return {
    takeMeasurements: async () => {
      await takeMemoryMeasurements()
    },
    stopProfiling: async () => {
      await stopCPUProfiling()
      await stopMemoryProfiling()
      stopNetworkProfiling()
    },
  }
}

async function startCPUProfiling(client: CDPSession) {
  await client.send('Profiler.enable')
  await client.send('Profiler.start')

  return async () => {
    const { profile } = await client.send('Profiler.stop')

    const timeDeltaForNodeId = new Map<number, number>()

    for (let index = 0; index < profile.samples!.length; index += 1) {
      const nodeId = profile.samples![index]
      timeDeltaForNodeId.set(nodeId, (timeDeltaForNodeId.get(nodeId) || 0) + profile.timeDeltas![index])
    }

    let total = 0
    for (const node of profile.nodes) {
      if (isSDKCallFrame(node.callFrame)) {
        total += timeDeltaForNodeId.get(node.id) || 0
      }
    }

    console.log(`CPU: ${total} microseconds`)
  }
}

async function startMemoryProfiling(client: CDPSession) {
  await client.send('HeapProfiler.enable')
  await client.send('HeapProfiler.startSampling', {
    // Set a low sampling interval to have more precise measurement
    samplingInterval: 100,
  })

  const measurements: number[] = []

  return {
    takeMemoryMeasurements: async () => {
      await client.send('HeapProfiler.collectGarbage')
      const { profile } = await client.send('HeapProfiler.getSamplingProfile')

      const sizeForNodeId = new Map<number, number>()

      for (const sample of profile.samples) {
        sizeForNodeId.set(sample.nodeId, (sizeForNodeId.get(sample.nodeId) || 0) + sample.size)
      }

      let total = 0
      for (const node of iterNodes(profile.head)) {
        if (isSDKCallFrame(node.callFrame)) {
          total += sizeForNodeId.get(node.id) || 0
        }
      }
      measurements.push(total)
    },

    stopMemoryProfiling: async () => {
      await client.send('HeapProfiler.stopSampling')

      measurements.sort((a, b) => a - b)
      const median = measurements[Math.floor(measurements.length / 2)]
      console.log(`Memory: ${median} bytes (median)`)
    },
  }
}

async function startNetworkProfiling(client: CDPSession) {
  await client.send('Network.enable')
  let total = 0
  const requestListener = (info: Protocol.Network.RequestWillBeSentEvent) => {
    if (info.initiator.stack && isSDKCallFrame(info.initiator.stack.callFrames[0])) {
      total += getRequestApproximateSize(info.request)
    }
  }
  client.on('Network.requestWillBeSent', requestListener)
  return () => {
    client.off('Network.requestWillBeSent', requestListener)

    console.log(`Bandwidth: ${total} bytes`)
  }
}

function isSDKCallFrame(callFrame: Protocol.Runtime.CallFrame) {
  return callFrame.url.startsWith('https://www.datadoghq-browser-agent.com/')
}

function* iterNodes<N extends { children?: N[] }>(root: N): Generator<N> {
  yield root
  if (root.children) {
    for (const child of root.children) {
      yield* iterNodes(child)
    }
  }
}

function getRequestApproximateSize(request: Protocol.Network.Request) {
  let bodySize = 0
  if (request.postDataEntries) {
    for (const { bytes } of request.postDataEntries) {
      if (bytes) {
        bodySize += Buffer.from(bytes, 'base64').byteLength
      }
    }
  }

  let headerSize = 0
  for (const [name, value] of Object.entries(request.headers)) {
    headerSize += name.length + value.length
  }

  return bodySize + headerSize
}
