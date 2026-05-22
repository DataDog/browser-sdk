import os from 'os'

export function getIp() {
  const networkInterface = (Object.values(os.networkInterfaces()) as os.NetworkInterfaceInfo[][])
    .flat()
    .find(({ family, internal }) => family === 'IPv4' && !internal)
  return networkInterface ? networkInterface.address : '127.0.0.1'
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

// `CI_JOB_NAME` for a parallel:matrix job looks like `e2e: [chromium]`. Strip the
// `: [...]` suffix so all matrix cells share a single report folder; per-cell results
// are disambiguated by filename instead (see PW_BROWSER usage in playwright.config.ts).
function getJobNameBase() {
  return process.env.CI_JOB_NAME?.replace(/: \[.*\]$/, '')
}

export function getTestReportDirectory() {
  const jobName = getJobNameBase()
  if (jobName) {
    return `test-report/${jobName}`
  }
}

export function getCoverageReportDirectory() {
  const jobName = getJobNameBase()
  if (jobName) {
    return `coverage/${jobName}`
  }

  return 'coverage'
}
