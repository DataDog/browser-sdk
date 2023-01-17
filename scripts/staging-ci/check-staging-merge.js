'use strict'

const { initGitConfig, executeCommand, printLog, printError, runMain } = require('../utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA
const CI_COMMIT_SHORT_SHA = process.env.CI_COMMIT_SHORT_SHA
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME
const MAIN_BRANCH = process.env.MAIN_BRANCH

runMain(async () => {
  await initGitConfig(REPOSITORY)
  await executeCommand(`git fetch --no-tags origin ${MAIN_BRANCH}`)
  const ciConfigurationFromMain = await executeCommand(`git show origin/${MAIN_BRANCH}:.gitlab-ci.yml`)
  const currentStaging = /CURRENT_STAGING: (staging-.*)/g.exec(ciConfigurationFromMain)?.[1]
  await executeCommand(`git fetch --no-tags origin ${currentStaging}`)
  await executeCommand(`git checkout ${currentStaging} -f`)
  await executeCommand('git pull')

  printLog(
    `Checking if branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA}) can be merged into ${currentStaging}...`
  )
  try {
    await executeCommand(`git merge --no-ff "${CI_COMMIT_SHA}"`)
  } catch (error) {
    const diff = await executeCommand('git diff')
    printError(
      `Conflicts:\n${diff}\n` +
        'You can resolve these conflicts by running "branches-status staging fix" in your branch' +
        'and resolving the merge conflicts.'
    )
    throw error
  }

  printLog('Check done.')
})
