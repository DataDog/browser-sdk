'use strict'

const { printLog, printError, runMain } = require('../lib/execution-utils')
const { command } = require('../lib/command')
const { initGitConfig } = require('../lib/git-utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const CURRENT_STAGING_BRANCH = process.env.CURRENT_STAGING
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA
const CI_COMMIT_SHORT_SHA = process.env.CI_COMMIT_SHORT_SHA
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME

runMain(() => {
  initGitConfig(REPOSITORY)
  command`git fetch --no-tags origin ${CURRENT_STAGING_BRANCH}`.run()
  command`git checkout ${CURRENT_STAGING_BRANCH} -f`.run()
  command`git pull origin ${CURRENT_STAGING_BRANCH}`.run()

  // Commit can already be merged if someone merge main into his branch and
  // run to-staging before the end of this scripts
  if (isCommitAlreadyMerged()) {
    printLog('Already merged.')
    return
  }

  printLog(`Merging branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA}) into ${CURRENT_STAGING_BRANCH}...`)
  try {
    command`git merge --no-ff ${CI_COMMIT_SHA}`.run()
  } catch (error) {
    const diff = command`git diff`.run()
    printError(
      `Conflicts:\n${diff}\n` +
        'See "How to fix staging" in Confluence for help: https://datadoghq.atlassian.net/wiki/spaces/FRON/pages/2548269306/How+to+fix+staging+conflicts'
    )
    throw error
  }

  const commitMessage = command`git show -s --format=%B`.run()
  const newSummary = `Merge branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA}) with ${CURRENT_STAGING_BRANCH}`
  const message = `${newSummary}\n\n${commitMessage}`

  command`git commit --amend -m ${message}`.run()
  command`git push origin ${CURRENT_STAGING_BRANCH}`.run()

  printLog('Merge done.')
})

function isCommitAlreadyMerged() {
  try {
    command`git merge-base --is-ancestor ${CI_COMMIT_SHA} ${CURRENT_STAGING_BRANCH}`.run()
    return true
  } catch {
    return false
  }
}
