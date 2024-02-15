const fs = require('fs')
const path = require('path')
const { BrowserSdkVersion } = require('./lib/browser-sdk-version')
const { getOrg2ApiKey } = require('./lib/secrets')
const { runMain, fetch } = require('./lib/execution-utils')

const rumPath = path.join(__dirname, '../packages/rum/bundle/datadog-rum.js')
const logsPath = path.join(__dirname, '../packages/logs/bundle/datadog-logs.js')
const rumSlimPath = path.join(__dirname, '../packages/rum-slim/bundle/datadog-rum-slim.js')
const workerPath = path.join(__dirname, '../packages/worker/bundle/worker.js')

const LOG_INTAKE_URL = 'https://http-intake.logs.datadoghq.com/api/v2/logs'
const LOG_INTAKE_REQUEST_HEADERS = {
  'DD-API-KEY': getOrg2ApiKey(),
  'Content-Type': 'application/json',
}

runMain(async () => {
  const logData = [
    {
      message: 'Browser SDK bundles sizes',
      service: 'browser-sdk',
      ddsource: 'browser-sdk',
      env: 'ci',
      bundle_sizes: {
        rum: getBundleSize(rumPath),
        logs: getBundleSize(logsPath),
        rum_slim: getBundleSize(rumSlimPath),
        worker: getBundleSize(workerPath),
      },
      version: BrowserSdkVersion,
      commit: process.env.CI_COMMIT_SHORT_SHA,
      branch: process.env.CI_COMMIT_REF_NAME,
    },
  ]
  await sendLogToOrg2(logData)
})

function getBundleSize(pathBundle) {
  try {
    const file = fs.statSync(pathBundle)
    return file.size
  } catch (error) {
    throw new Error('Failed to get bundle size', { cause: error })
  }
}

async function sendLogToOrg2(bundleData = {}) {
  await fetch(LOG_INTAKE_URL, {
    method: 'POST',
    headers: LOG_INTAKE_REQUEST_HEADERS,
    body: JSON.stringify(bundleData),
  })
}
