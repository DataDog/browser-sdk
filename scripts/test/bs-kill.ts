import { printLog, runMain, timeout } from '../lib/executionUtils.js'
import { browserStackRequest } from '../lib/bsUtils.js'

const MINIMUM_WORKER_LIFE = 30_000

const BS_WORKERS_URL = 'https://api.browserstack.com/5/workers'
const buildBsWorkerUrl = (workerId: string): string => `https://api.browserstack.com/5/worker/${workerId}`

interface Worker {
  id: string
}

interface StopResponse {
  time?: number
  message?: string
}

runMain(async () => {
  const workerIds = await getActiveWorkerIds()
  printLog(`Stopping ${workerIds.length} workers`)
  await Promise.all(workerIds.map((workerId) => stopWorker(workerId)))
  process.exit(0)
})

async function getActiveWorkerIds(): Promise<string[]> {
  const workers = (await browserStackRequest(BS_WORKERS_URL)) as Worker[]
  return workers.map((worker: Worker) => worker.id)
}

async function stopWorker(workerId: string): Promise<void> {
  const stopResponse = (await browserStackRequest(buildBsWorkerUrl(workerId), { method: 'DELETE' })) as StopResponse
  // stopResponse:
  // - when stopped: {"time":X.Y}
  // - when worker not old enough: {"message":"worker is running for X.Y secs, minimum life is 30 sec"}
  if (stopResponse.time === undefined) {
    printLog(`Worker ${workerId} not stopped, retrying in 30s`)
    await timeout(MINIMUM_WORKER_LIFE)
    await stopWorker(workerId)
  }
}
