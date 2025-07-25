import { printLog, printError, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { initGitConfig } from '../lib/gitUtils.ts'

const REPOSITORY = process.env.GIT_REPOSITORY
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA
const CI_COMMIT_SHORT_SHA = process.env.CI_COMMIT_SHORT_SHA
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME
const MAIN_BRANCH = process.env.MAIN_BRANCH

runMain(() => {
  if (!REPOSITORY || !CI_COMMIT_SHA || !CI_COMMIT_SHORT_SHA || !CI_COMMIT_REF_NAME || !MAIN_BRANCH) {
    throw new Error('Missing required environment variables')
  }

  initGitConfig(REPOSITORY)
  command`git fetch --no-tags origin ${MAIN_BRANCH}`.run()
  const ciConfigurationFromMain = command`git show origin/${MAIN_BRANCH}:.gitlab-ci.yml`.run()
  const currentStaging = /CURRENT_STAGING: (staging-.*)/g.exec(ciConfigurationFromMain)?.[1]

  if (!currentStaging) {
    throw new Error('Could not find CURRENT_STAGING in .gitlab-ci.yml')
  }

  command`git fetch --no-tags origin ${currentStaging}`.run()
  command`git checkout ${currentStaging} -f`.run()
  command`git pull`.run()

  printLog(
    `Checking if branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHORT_SHA}) can be merged into ${currentStaging}...`
  )
  try {
    command`git merge --no-ff ${CI_COMMIT_SHA}`.run()
  } catch (error) {
    const diff = command`git diff`.run()
    printError(
      `Conflicts:\n${diff}\n` +
        'You can resolve these conflicts by running "branches-status staging fix" in your branch' +
        'and resolving the merge conflicts.'
    )
    throw error
  }

  printLog('Check done.')
})
