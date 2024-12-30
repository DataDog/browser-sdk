'use strict'

const { printLog, printError, runMain } = require('../lib/executionUtils')
const { command } = require('../lib/command')
const { initGitConfig } = require('../lib/gitUtils')

const REPOSITORY = process.env.GIT_REPOSITORY
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA
const CI_COMMIT_SHORT_SHA = process.env.CI_COMMIT_SHORT_SHA
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME
const MAIN_BRANCH = process.env.MAIN_BRANCH

runMain(() => {
  initGitConfig(REPOSITORY)
  command`git fetch --no-tags origin ${MAIN_BRANCH}`.run()
  const ciConfigurationFromMain = command`git show origin/${MAIN_BRANCH}:.gitlab-ci.yml`.run()
  const currentStaging = /CURRENT_STAGING: (staging-.*)/g.exec(ciConfigurationFromMain)?.[1]
  command`git fetch --no-tags origin ${currentStaging}`.run()

  printLog(
    `Checking if branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA}) can be squash merged into ${currentStaging}...`
  )

  try {
    command`git checkout ${MAIN_BRANCH} -f`.run()
    command`git pull`.run()
    command`git merge --squash ${CI_COMMIT_SHA}`.run()
  } catch (error) {
    const diff = command`git diff`.run()
    printError(
      `Conflicts:\n${diff}\n` +
        `You can resolve these conflicts by updating your branch with latest ${MAIN_BRANCH} changes.`
    )
    throw error
  }

  try {
    command`git commit -am ${'squash test'}`.run()

    command`git checkout ${currentStaging} -f`.run()
    command`git pull`.run()
    command`git merge ${MAIN_BRANCH}`.run()
  } catch (error) {
    const diff = command`git diff`.run()
    printError(
      `Conflicts:\n${diff}\n` +
        'You can resolve these conflicts by re-running "to-staging" on your branch to propagate latest changes.'
    )
    throw error
  }

  printLog('Check done.')
})
