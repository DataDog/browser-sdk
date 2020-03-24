const NAME = 'browser-sdk'

function getCIInfos() {
  const { CI_JOB_ID, CI_PIPELINE_ID, CI_COMMIT_SHORT_SHA } = process.env
  if (CI_PIPELINE_ID && CI_JOB_ID && CI_COMMIT_SHORT_SHA) {
    return `job: ${CI_JOB_ID} commit: ${CI_COMMIT_SHORT_SHA}`
  }
}

function getLocalInfos() {
  return process.env.USER
}

module.exports = function getTestName(baseName) {
  let infos = ''
  let tag = ''

  const ciInfos = getCIInfos()
  if (ciInfos) {
    tag = '[CI]'
    infos = ` - ${ciInfos}`
  } else {
    const localInfos = getLocalInfos()
    if (localInfos) {
      tag = '[LOCAL]'
      infos = ` - ${localInfos}`
    }
  }

  return `[${NAME}]${tag} ${baseName}${infos}`
}
