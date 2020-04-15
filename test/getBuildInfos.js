function getCIInfos() {
  const { CI_JOB_ID, CI_PIPELINE_ID, CI_COMMIT_SHORT_SHA } = process.env
  if (CI_PIPELINE_ID && CI_JOB_ID && CI_COMMIT_SHORT_SHA) {
    return `job: ${CI_JOB_ID} commit: ${CI_COMMIT_SHORT_SHA}`
  }
}

function getLocalInfos() {
  return `${process.env.USER} ${new Date().toLocaleString()}`
}

module.exports = function getBuildInfos() {
  const ciInfos = getCIInfos()
  if (ciInfos) {
    return ciInfos
  }
  const localInfos = getLocalInfos()
  if (localInfos) {
    return localInfos
  }
}
