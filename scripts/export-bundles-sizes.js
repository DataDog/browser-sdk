const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { getOrg2ApiKey } = require('./lib/secrets')
const { runMain, fetch: fetchWrapper } = require('./lib/execution-utils')

const rumPath = path.join(__dirname, '../packages/rum/bundle/datadog-rum.js')
const logsPath = path.join(__dirname, '../packages/logs/bundle/datadog-logs.js')
const rumSlimPath = path.join(__dirname, '../packages/rum-slim/bundle/datadog-rum-slim.js')
const workerPath = path.join(__dirname, '../packages/worker/bundle/worker.js')
const versionPath = path.join(__dirname, '../packages/rum/package.json')

const URL = 'https://http-intake.logs.datadoghq.com/api/v2/logs'
const HEADERS = {
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
      version: getVersion(),
      commit: getGitInformation('git rev-parse HEAD'),
      branch: process.env.GITHUB_REF ? process.env.GITHUB_REF.split('/').pop() : null,
    },
  ]
  await postBundleSize(URL, logData)
})

function getGitInformation(command) {
  try {
    return execSync(command)
      .toString('utf8')
      .replace(/[\n\r\s]+$/, '')
  } catch (error) {
    console.error('Failed to execute git command:', error)
    return null
  }
}

function getVersion() {
  try {
    const versionJson = fs.readFileSync(versionPath, 'utf8')
    return JSON.parse(versionJson).version
  } catch (error) {
    console.error('Failed to get version:', error)
    return null
  }
}

function getBundleSize(pathBundle) {
  try {
    const file = fs.statSync(pathBundle)
    return file.size
  } catch (error) {
    console.error('Failed to get bundle size:', error)
    return null
  }
}

async function postBundleSize(url = '', bundleData = {}) {
  await fetchWrapper(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(bundleData),
  })
}
