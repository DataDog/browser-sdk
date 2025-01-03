const packages = [
  { packageName: 'logs', service: 'browser-logs-sdk' },
  { packageName: 'rum', service: 'browser-rum-sdk' },
  { packageName: 'rum-slim', service: 'browser-rum-sdk' },
]

// ex: datadog-rum-v4.js, chunks/recorder-8d8a8dfab6958424038f-datadog-rum.js
const buildRootUploadPath = (filePath, version) => {
  // We don't suffix chunk names as they are referenced by the main bundle. Renaming them would require updates via Webpack, adding unnecessary complexity for minimal value.
  if (filePath.includes('chunks')) {
    return filePath
  }

  const [basePath, ...extensions] = filePath.split('.')
  const ext = extensions.join('.') // allow to handle multiple extensions like `.js.map`

  return `${basePath}-${version}.${ext}`
}

// ex: us1/v4/datadog-rum.js, eu1/v4/chunks/recorder-8d8a8dfab6958424038f-datadog-rum.js
const buildDatacenterUploadPath = (datacenter, filePath, version) => `${datacenter}/${version}/${filePath}`

// ex: pull-request/2781/datadog-rum.js, pull-request/2781/chunks/recorder-8d8a8dfab6958424038f-datadog-rum.js
const buildPullRequestUploadPath = (filePath, version) => `pull-request/${version}/${filePath}`

// ex: packages/rum/bundle
const buildBundleFolder = (packageName) => `packages/${packageName}/bundle`

module.exports = {
  packages,
  buildRootUploadPath,
  buildDatacenterUploadPath,
  buildBundleFolder,
  buildPullRequestUploadPath,
}
