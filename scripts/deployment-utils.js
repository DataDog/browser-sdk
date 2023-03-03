const packages = [
  { packageName: 'logs', service: 'browser-logs-sdk' },
  { packageName: 'rum', service: 'browser-rum-sdk' },
  { packageName: 'rum-slim', service: 'browser-rum-sdk' },
]

// ex: datadog-rum-v4.js
const buildRootUploadPath = (packageName, version, extension = 'js') => `datadog-${packageName}-${version}.${extension}`

// ex: us1/v4/datadog-rum.js
const buildDatacenterUploadPath =
  (datacenter) =>
  (packageName, version, extension = 'js') =>
    `${datacenter}/${version}/datadog-${packageName}.${extension}`

// ex: packages/rum/bundle/datadog-rum.js
const buildSourcePath = (packageName, extension = 'js') =>
  `packages/${packageName}/bundle/datadog-${packageName}.${extension}`

module.exports = {
  packages,
  buildRootUploadPath,
  buildDatacenterUploadPath,
  buildSourcePath,
}
