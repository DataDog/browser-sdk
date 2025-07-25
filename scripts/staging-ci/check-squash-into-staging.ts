'use strict'

import { printLog, printError, runMain } from '../lib/executionUtils.js'
import { command } from '../lib/command.js'
import { initGitConfig } from '../lib/gitUtils.js'

const REPOSITORY = process.env.GIT_REPOSITORY as string
const CI_COMMIT_SHORT_SHA = process.env.CI_COMMIT_SHORT_SHA as string
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA as string
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME as string
const MAIN_BRANCH = process.env.MAIN_BRANCH as string

runMain(() => {
  initGitConfig(REPOSITORY)
  command`git fetch --no-tags origin ${MAIN_BRANCH}`.run()
  const ciConfigurationFromMain = command`git show origin/${MAIN_BRANCH}:.gitlab-ci.yml`.run()
  const currentStagingMatch = /CURRENT_STAGING: (staging-.*)/g.exec(ciConfigurationFromMain)
  if (!currentStagingMatch) {
    throw new Error('Could not find CURRENT_STAGING in .gitlab-ci.yml')
  }
  const currentStaging = currentStagingMatch[1]
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
