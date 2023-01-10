'use strict'

const { initGitConfig, executeCommand, printLog, printError, runMain } = require('../utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const CURRENT_STAGING_BRANCH = process.env.CURRENT_STAGING
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA
const CI_COMMIT_SHORT_SHA = process.env.CI_COMMIT_SHORT_SHA
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME

runMain(async () => {
  await initGitConfig(REPOSITORY)
  await executeCommand(`git fetch --no-tags origin ${CURRENT_STAGING_BRANCH}`)
  await executeCommand(`git checkout ${CURRENT_STAGING_BRANCH} -f`)
  await executeCommand(`git pull origin ${CURRENT_STAGING_BRANCH}`)

  // Commit can already be merged if someone merge main into his branch and
  // run to-staging before the end of this scripts
  if (await isCommitAlreadyMerged()) {
    printLog('Already merged.')
    return
  }

  printLog(`Merging branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA}) into ${CURRENT_STAGING_BRANCH}...`)
  try {
    await executeCommand(`git merge --no-ff "${CI_COMMIT_SHA}"`)
  } catch (error) {
    const diff = await executeCommand('git diff')
    printError(`Conflicts:\n${diff}`)
    throw error
  }

  const commitMessage = await executeCommand('git show -s --format=%B')
  const newSummary = `Merge branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA}) with ${CURRENT_STAGING_BRANCH}`
  const message = `${newSummary}\n\n${commitMessage}`

  await executeCommand(`git commit --amend -m "${message}"`)
  await executeCommand(`git push origin ${CURRENT_STAGING_BRANCH}`)

  printLog('Merge done.')
})

async function isCommitAlreadyMerged() {
  try {
    await executeCommand(`git merge-base --is-ancestor ${CI_COMMIT_SHA} ${CURRENT_STAGING_BRANCH}`)
    return true
  } catch {
    return false
  }
}
