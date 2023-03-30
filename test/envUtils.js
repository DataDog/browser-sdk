const os = require('os')

function getIp() {
  return Object.values(os.networkInterfaces())
    .flat()
    .find(({ family, internal }) => family === 'IPv4' && !internal).address
}

function getBuildInfos() {
  const ciInfos = getCIInfos()
  if (ciInfos) {
    return ciInfos
  }
  const localInfos = getLocalInfos()
  if (localInfos) {
    return localInfos
  }
}

function getRunId() {
  return process.env.CI_JOB_ID || process.env.USER
}

function getCIInfos() {
  const { CI_JOB_ID, CI_PIPELINE_ID, CI_COMMIT_SHORT_SHA } = process.env
  if (CI_PIPELINE_ID && CI_JOB_ID && CI_COMMIT_SHORT_SHA) {
    return `job: ${CI_JOB_ID} commit: ${CI_COMMIT_SHORT_SHA}`
  }
}

function getLocalInfos() {
  return `${process.env.USER} ${new Date().toLocaleString()}`
}

function getTestReportDirectory() {
  if (process.env.CI_JOB_NAME) {
    return `test-report/${process.env.CI_JOB_NAME}`
  }
}

module.exports = {
  getRunId,
  getBuildInfos,
  getIp,
  getTestReportDirectory,
}
