const path = require('path')
const fs = require('fs')
const { browserSdkVersion } = require('../lib/browser-sdk-version')
const { runMain } = require('../lib/execution-utils')
const { reportBundleSizes } = require('./report-as-a-pr-comment')
const { createLogData, sendLogToOrg2 } = require('./report-to-datadog')

const rumPath = path.join(__dirname, '../../packages/rum/bundle/datadog-rum.js')
const logsPath = path.join(__dirname, '../../packages/logs/bundle/datadog-logs.js')
const rumSlimPath = path.join(__dirname, '../../packages/rum-slim/bundle/datadog-rum-slim.js')
const workerPath = path.join(__dirname, '../../packages/worker/bundle/worker.js')

runMain(async () => {
  const bundleSizes = {
    rum: getBundleSize(rumPath),
    logs: getBundleSize(logsPath),
    rum_slim: getBundleSize(rumSlimPath),
    worker: getBundleSize(workerPath),
  }
  const logData = createLogData(bundleSizes, browserSdkVersion)
  await sendLogToOrg2(logData)
  await reportBundleSizes(bundleSizes)
})

function getBundleSize(pathBundle) {
  try {
    const file = fs.statSync(pathBundle)
    return file.size
  } catch (error) {
    throw new Error('Failed to get bundle size', { cause: error })
  }
}
