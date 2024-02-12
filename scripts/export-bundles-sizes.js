const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')
const { getOrg2ApiKey } = require('./lib/secrets')
const { runMain } = require('./lib/execution-utils')
const url = 'https://http-intake.logs.datadoghq.com/api/v2/logs'
const rumPath = path.join(__dirname, '../packages/rum/bundle/datadog-rum.js')
const logsPath = path.join(__dirname, '../packages/logs/bundle/datadog-logs.js')
const rumSlimPath = path.join(__dirname, '../packages/rum-slim/bundle/datadog-rum-slim.js')
const workerPath = path.join(__dirname, '../packages/worker/bundle/worker.js')
const versionPath = path.join(__dirname, '../packages/rum/package.json')

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
      version: getVersion(),
      commit: getCommitId(),
    },
  ]
  await postBundleSize(url, logData)
})

const getCommitId = () => childProcess.execSync('git rev-parse HEAD').toString().trim()

function getVersion() {
  const versionJson = fs.readFileSync(versionPath, 'utf8')
  return JSON.parse(versionJson).version
}

function getBundleSize(pathBundle) {
  const file = fs.statSync(pathBundle)
  return file.size
}

async function postBundleSize(url = '', bundleData = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'DD-API-KEY': getOrg2ApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bundleData),
  })
  console.log(await response.text())
}
