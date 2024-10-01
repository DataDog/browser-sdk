'use strict'

const fs = require('fs')
const { printLog, runMain } = require('../lib/executionUtils')
const { command } = require('../lib/command')
const { CI_FILE, replaceCiFileVariable, readCiFileVariable } = require('../lib/filesUtils')
const { initGitConfig } = require('../lib/gitUtils')

const REPOSITORY = process.env.GIT_REPOSITORY
const MAIN_BRANCH = process.env.MAIN_BRANCH

const CURRENT_STAGING_BRANCH = readCiFileVariable('CURRENT_STAGING')
const NEW_STAGING_NUMBER = getWeekNumber().toString().padStart(2, '0')
const NEW_STAGING_BRANCH = `staging-${NEW_STAGING_NUMBER}`

runMain(async () => {
  // used to share the new staging name to the notification jobs
  fs.appendFileSync('build.env', `NEW_STAGING=${NEW_STAGING_BRANCH}`)

  initGitConfig(REPOSITORY)
  command`git fetch --no-tags origin ${MAIN_BRANCH} ${CURRENT_STAGING_BRANCH}`.run()
  command`git checkout ${MAIN_BRANCH} -f`.run()
  command`git pull`.run()

  const isNewBranch = CURRENT_STAGING_BRANCH !== NEW_STAGING_BRANCH
  if (isNewBranch) {
    printLog(`Changing staging branch in ${CI_FILE}...`)

    await replaceCiFileVariable('CURRENT_STAGING', NEW_STAGING_BRANCH)
    command`git commit ${CI_FILE} -m ${`👷 Bump staging to ${NEW_STAGING_BRANCH}`}`.run()
    command`git push origin ${MAIN_BRANCH}`.run()
  } else {
    printLog(`Staging branch already up to date in ${CI_FILE}. Skipping.`)
  }

  try {
    printLog('Deleting existing staging local branch if it exists...')
    command`git branch -D ${NEW_STAGING_BRANCH}`.run()
  } catch {
    // The local branch did not exist yet, let's continue
  }

  printLog('Creating the new staging branch...')
  command`git checkout -b ${NEW_STAGING_BRANCH}`.run()
  command`git push origin -f ${NEW_STAGING_BRANCH}`.run()

  command`git checkout ${CURRENT_STAGING_BRANCH}`.run()
  command`git pull origin ${CURRENT_STAGING_BRANCH}`.run()

  if (isNewBranch && fs.existsSync(CI_FILE)) {
    printLog('Disabling CI on the old branch...')
    command`git rm ${CI_FILE}`.run()
    command`git commit ${CI_FILE} -m ${`Remove ${CI_FILE} on old branch so pushes are noop`}`.run()
    command`git push origin ${CURRENT_STAGING_BRANCH}`.run()
  } else {
    printLog('CI already disabled on the old branch. Skipping.')
  }

  printLog('Reset done.')
})

function getWeekNumber() {
  const today = new Date()
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
  return Math.ceil(((today - yearStart) / 86400000 + yearStart.getUTCDay() + 1) / 7)
}
