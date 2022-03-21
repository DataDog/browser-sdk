'use strict'

const fs = require('fs')
const {
  CI_FILE,
  initGitConfig,
  executeCommand,
  printLog,
  logAndExit,
  replaceCiVariable,
  sendSlackMessage,
} = require('../utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const MAIN_BRANCH = process.env.MAIN_BRANCH
const CI_PROJECT_NAME = process.env.CI_PROJECT_NAME
const CI_PIPELINE_ID = process.env.CI_PIPELINE_ID
const BUILD_URL = `${process.env.CI_PROJECT_URL}/pipelines/${CI_PIPELINE_ID}`

const CURRENT_STAGING_BRANCH = process.env.CURRENT_STAGING
const NEW_STAGING_NUMBER = getWeekNumber().toString().padStart(2, '0')
const NEW_STAGING_BRANCH = `staging-${NEW_STAGING_NUMBER}`

async function main() {
  await initGitConfig(REPOSITORY)
  await executeCommand(`git fetch --no-tags origin ${MAIN_BRANCH} ${CURRENT_STAGING_BRANCH}`)
  await executeCommand(`git checkout ${MAIN_BRANCH} -f`)
  await executeCommand('git pull')

  const isNewBranch = CURRENT_STAGING_BRANCH !== NEW_STAGING_BRANCH
  if (isNewBranch) {
    printLog(`Changing staging branch in ${CI_FILE}...`)

    await replaceCiVariable('CURRENT_STAGING', NEW_STAGING_BRANCH)
    await executeCommand(`git commit ${CI_FILE} -m "👷 Bump staging to ${NEW_STAGING_BRANCH}"`)
    await executeCommand(`git push origin ${MAIN_BRANCH}`)
  } else {
    printLog(`Staging branch already up to date in ${CI_FILE}. Skipping.`)
  }

  const isStagingAlreadyCreated = await executeCommand(`git ls-remote --heads ${REPOSITORY} ${NEW_STAGING_BRANCH}`)
  if (!isStagingAlreadyCreated) {
    printLog('Creating the new staging branch...')
    await executeCommand(`git checkout -b ${NEW_STAGING_BRANCH}`)
    await executeCommand(`git push origin ${NEW_STAGING_BRANCH}`)
  } else {
    printLog('New staging branch already created. Skipping.')
  }

  await executeCommand(`git checkout ${CURRENT_STAGING_BRANCH}`)
  await executeCommand('git pull')

  if (isNewBranch && fs.existsSync(CI_FILE)) {
    printLog('Disabling CI on the old branch...')
    await executeCommand(`git rm ${CI_FILE}`)
    await executeCommand(`git commit ${CI_FILE} -m "Remove ${CI_FILE} on old branch so pushes are noop"`)
    await executeCommand(`git push origin ${CURRENT_STAGING_BRANCH}`)
  } else {
    printLog('CI already disabled on the old branch. Skipping.')
  }

  printLog('Reset done.')

  await sendSlackMessage(
    '#browser-sdk-deploy',
    `:white_check_mark: [*${CI_PROJECT_NAME}*] Staging has been reset from *${CURRENT_STAGING_BRANCH}* ` +
      `to *${NEW_STAGING_BRANCH}* on pipeline <${BUILD_URL}|${CI_PIPELINE_ID}>.`
  )
}

function getWeekNumber() {
  const today = new Date()
  const yearStart = new Date(today.getUTCFullYear(), 0, 1)
  return Math.ceil(((today - yearStart) / 86400000 + yearStart.getUTCDay() + 1) / 7)
}

main().catch(async (error) => {
  await sendSlackMessage(
    '#browser-sdk-deploy',
    `:x: [*${CI_PROJECT_NAME}*] Staging failed to reset from *${CURRENT_STAGING_BRANCH}* ` +
      `to *${NEW_STAGING_BRANCH}* on pipeline <${BUILD_URL}|${CI_PIPELINE_ID}>.`
  )
  logAndExit(error)
})
