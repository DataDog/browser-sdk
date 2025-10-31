import os from 'os'

export function getIp() {
  return (Object.values(os.networkInterfaces()) as os.NetworkInterfaceInfo[][])
    .flat()
    .find(({ family, internal }) => family === 'IPv4' && !internal)!.address
}

export function getBuildInfos() {
  const ciInfos = getCIInfos()
  if (ciInfos) {
    return ciInfos
  }
  const localInfos = getLocalInfos()
  if (localInfos) {
    return localInfos
  }
}

export function getRunId() {
  return process.env.CI_JOB_ID || process.env.USER || 'n/a'
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

export function getTestReportDirectory() {
  if (process.env.CI_JOB_NAME) {
    return `test-report/${process.env.CI_JOB_NAME}`
  }
}

export function getCoverageReportDirectory() {
  if (process.env.CI_JOB_NAME) {
    return `coverage/${process.env.CI_JOB_NAME}`
  }

  return 'coverage'
}
