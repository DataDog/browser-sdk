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

  printLog(
    `Checking if branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA}) can be squash merged into ${currentStaging}...`
  )

  try {
    await executeCommand(`git checkout ${MAIN_BRANCH} -f`)
    await executeCommand('git pull')
    await executeCommand(`git merge --squash "${CI_COMMIT_SHA}"`)
  } catch (error) {
    const diff = await executeCommand('git diff')
    printError(
      `Conflicts:\n${diff}\n` +
        `You can resolve these conflicts by updating your branch with latest ${MAIN_BRANCH} changes.`
    )
    throw error
  }

  try {
    await executeCommand('git commit -am "squash test"')

    await executeCommand(`git checkout ${currentStaging} -f`)
    await executeCommand('git pull')
    await executeCommand(`git merge "${MAIN_BRANCH}"`)
  } catch (error) {
    const diff = await executeCommand('git diff')
    printError(
      `Conflicts:\n${diff}\n` +
        'You can resolve these conflicts by re-running "to-staging" on your branch to propagate latest changes.'
    )
    throw error
  }

  printLog('Check done.')
})
