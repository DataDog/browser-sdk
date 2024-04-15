const packages = [
  { packageName: 'logs', service: 'browser-logs-sdk' },
  { packageName: 'rum', service: 'browser-rum-sdk' },
  { packageName: 'rum-slim', service: 'browser-rum-sdk' },
]

// ex: datadog-rum-v4.js
const buildRootUploadPath = (packageName, version, extension = 'js') => `datadog-${packageName}-${version}.${extension}`

// ex: us1/v4/datadog-rum.js
const buildDatacenterUploadPath = (datacenter, packageName, version, extension = 'js') =>
  `${datacenter}/${version}/datadog-${packageName}.${extension}`

// ex: datadog-rum.js
const buildBundleFileName = (packageName, extension = 'js') => `datadog-${packageName}.${extension}`

// ex: pull-request/2781/datadog-rum.js
function buildPullRequestUploadPath(packageName, version, extension = 'js') {
  return `pull-request/${version}/datadog-${packageName}.${extension}`
}
// ex: packages/rum/bundle
const buildBundleFolder = (packageName) => `packages/${packageName}/bundle`

module.exports = {
  packages,
  buildRootUploadPath,
  buildDatacenterUploadPath,
  buildBundleFileName,
  buildBundleFolder,
  buildPullRequestUploadPath,
}
