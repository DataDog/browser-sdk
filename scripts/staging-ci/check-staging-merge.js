'use strict'

const { initGitConfig, executeCommand, printLog, printError, logAndExit } = require('../utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const CURRENT_STAGING_BRANCH = process.env.CURRENT_STAGING
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA
const CI_COMMIT_SHORT_SHA = process.env.CI_COMMIT_SHORT_SHA
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME
const MAIN_BRANCH = process.env.MAIN_BRANCH

async function main() {
  await initGitConfig(REPOSITORY)
  await executeCommand(`git fetch --no-tags origin ${MAIN_BRANCH} ${CURRENT_STAGING_BRANCH}`)
  await executeCommand(`git checkout ${CURRENT_STAGING_BRANCH} -f`)
  await executeCommand(`git pull`)

  printLog(
    `Checking if branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA})` +
      ` can be merged into ${CURRENT_STAGING_BRANCH}...`
  )
  try {
    await executeCommand(`git merge --no-ff "${CI_COMMIT_SHA}"`)
  } catch (error) {
    const diff = await executeCommand(`git diff`)
    printError(
      `Conflicts:\n${diff}\n` +
        'You can resolve these conflicts by running "branches-status staging fix" in your branch' +
        'and resolving the merge conflicts.'
    )
    throw error
  }

  printLog('Check done.')
}

main().catch(logAndExit)
