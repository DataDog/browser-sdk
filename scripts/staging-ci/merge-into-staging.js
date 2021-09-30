'use strict'

const { initGitConfig, executeCommand, printLog, printError, logAndExit } = require('../utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const CURRENT_STAGING_BRANCH = process.env.CURRENT_STAGING
const CI_COMMIT_SHA = process.env.CI_COMMIT_SHA
const CI_COMMIT_REF_NAME = process.env.CI_COMMIT_REF_NAME

async function main() {
  await initGitConfig(REPOSITORY)
  await executeCommand(`git fetch --no-tags origin ${CURRENT_STAGING_BRANCH}`)
  await executeCommand(`git checkout ${CURRENT_STAGING_BRANCH} -f`)
  await executeCommand(`git pull origin ${CURRENT_STAGING_BRANCH}`)

  printLog(`Merging branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHA}) into ${CURRENT_STAGING_BRANCH}...`)
  try {
    await executeCommand(`git merge --no-ff "${CI_COMMIT_SHA}"`)
  } catch (error) {
    const diff = await executeCommand(`git diff`)
    printError(`Conflicts:\n${diff}`)
    throw error
  }

  const commitMessage = await executeCommand(`git show -s --format=%B`)
  const newSummary = `Merge branch '${CI_COMMIT_REF_NAME}' (${CI_COMMIT_SHA}) with ${CURRENT_STAGING_BRANCH}`
  const message = `${newSummary}\n\n${commitMessage}`

  await executeCommand(`git commit --amend -m "${message}"`)
  await executeCommand(`git push origin ${CURRENT_STAGING_BRANCH}`)

  printLog('Merge done.')
}

main().catch(logAndExit)
