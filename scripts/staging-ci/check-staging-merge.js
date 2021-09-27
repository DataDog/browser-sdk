'use strict'

const { initGitConfig, executeCommand, printLog, printError } = require('../utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const CURRENT_STAGING_BRANCH = process.env.CURRENT_STAGING
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME
const MAIN_BRANCH = process.env.MAIN_BRANCH

async function main() {
  await initGitConfig(REPOSITORY)
  await executeCommand(`git fetch --no-tags origin ${MAIN_BRANCH} ${CURRENT_STAGING_BRANCH}`)

  printLog(`Check if the ${CI_COMMIT_REF_NAME} (${CI_COMMIT_SHA}) is up to date with ${MAIN_BRANCH}...`)
  const lastMainCommitHash = (await executeCommand(`git rev-parse origin/${MAIN_BRANCH}`)).trim()

  try {
    await executeCommand(`git merge-base --is-ancestor ${lastMainCommitHash} ${CI_COMMIT_SHA}`)
  } catch (e) {
    printError(`${CI_COMMIT_REF_NAME} is out of date with the ${MAIN_BRANCH}! 
Please merge (or rebase) ${MAIN_BRANCH} with ${CI_COMMIT_REF_NAME} and try again.`)
    throw e
  }

  await executeCommand(`git checkout ${CURRENT_STAGING_BRANCH} -f`)
  await executeCommand(`git pull`)

  printLog(`Checking if ${CI_COMMIT_REF_NAME} (${CI_COMMIT_SHA}) can be merged with ${CURRENT_STAGING_BRANCH}...`)
  try {
    await executeCommand(`git merge --no-ff "${CI_COMMIT_SHA}"`)
  } catch {
    const diff = await executeCommand(`git diff`)
    printError(`Conflicts:\n${diff}`)
    throw e
  }

  printLog('Check Done.')
}

main().catch((e) => {
  printError('\nStacktrace:\n', e)
  process.exit(1)
})
