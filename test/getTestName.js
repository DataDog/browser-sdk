const { CI_JOB_ID, CI_PIPELINE_ID, CI_COMMIT_SHORT_SHA } = process.env

function getCIInfos() {
  if (CI_PIPELINE_ID && CI_JOB_ID && CI_COMMIT_SHORT_SHA) {
    return `job: ${CI_JOB_ID} commit: ${CI_COMMIT_SHORT_SHA}`
  }
}

module.exports = function getTestName(baseName) {
  const ciInfos = getCIInfos()
  const prepend = ciInfos ? ` - ${ciInfos}` : ''
  return `browser-sdk ${baseName}${prepend}`
}
