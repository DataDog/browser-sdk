'use strict'
/**
 * This script stops all BrowserStack workers that are currently running.
 * Useful when troubleshooting BrowserStack issues locally.
 */
const { printLog, runMain, timeout } = require('../lib/executionUtils')
const { browserStackRequest } = require('../lib/bsUtils')

const MINIMUM_WORKER_LIFE = 30_000

const BS_WORKERS_URL = 'https://api.browserstack.com/5/workers'
const buildBsWorkerUrl = (workerId) => `https://api.browserstack.com/5/worker/${workerId}`

runMain(async () => {
  const workerIds = await getActiveWorkerIds()
  printLog(`Stopping ${workerIds.length} workers`)
  await Promise.all(workerIds.map((workerId) => stopWorker(workerId)))
  process.exit(0)
})

async function getActiveWorkerIds() {
  return (await browserStackRequest(BS_WORKERS_URL)).map((worker) => worker.id)
}

async function stopWorker(workerId) {
  const stopResponse = await browserStackRequest(buildBsWorkerUrl(workerId), { method: 'DELETE' })
  // stopResponse:
  // - when stopped: {"time":X.Y}
  // - when worker not old enough: {"message":"worker is running for X.Y secs, minimum life is 30 sec"}
  if (stopResponse.time === undefined) {
    printLog(`Worker ${workerId} not stopped, retrying in 30s`)
    await timeout(MINIMUM_WORKER_LIFE)
    await stopWorker(workerId)
  }
}
