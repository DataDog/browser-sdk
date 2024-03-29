const { fetchHandlingError } = require('../lib/execution-utils')
const { getOrg2ApiKey } = require('../lib/secrets')
const { browserSdkVersion } = require('../lib/browser-sdk-version')

const LOG_INTAKE_URL = 'https://http-intake.logs.datadoghq.com/api/v2/logs'
const LOG_INTAKE_REQUEST_HEADERS = {
  'DD-API-KEY': getOrg2ApiKey(),
  'Content-Type': 'application/json',
}

async function reportToDatadog(bundleSizes) {
  const logData = createLogData(bundleSizes, browserSdkVersion)
  await sendLogToOrg2(logData)
}

function createLogData(bundleSizes, browserSdkVersion) {
  return [
    {
      message: 'Browser SDK bundles sizes',
      service: 'browser-sdk',
      ddsource: 'browser-sdk',
      env: 'ci',
      bundle_sizes: bundleSizes,
      version: browserSdkVersion,
      commit: process.env.CI_COMMIT_SHORT_SHA,
      branch: process.env.CI_COMMIT_REF_NAME,
    },
  ]
}

async function sendLogToOrg2(bundleData = {}) {
  await fetchHandlingError(LOG_INTAKE_URL, {
    method: 'POST',
    headers: LOG_INTAKE_REQUEST_HEADERS,
    body: JSON.stringify(bundleData),
  })
}

module.exports = {
  reportToDatadog,
}
