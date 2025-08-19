import fs from 'node:fs'
import { printLog, runMain, fetchHandlingError } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { CI_FILE, replaceCiFileVariable } from '../lib/filesUtils.ts'
import { initGitConfig, createPullRequest } from '../lib/gitUtils.ts'

const REPOSITORY = process.env.GIT_REPOSITORY
const MAIN_BRANCH = process.env.MAIN_BRANCH
const CURRENT_CI_IMAGE = process.env.CURRENT_CI_IMAGE
const CURRENT_PACKAGE_VERSION = process.env.CHROME_PACKAGE_VERSION

const CHROME_PACKAGE_URL = 'https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable'

runMain(async () => {
  if (!REPOSITORY || !MAIN_BRANCH || !CURRENT_CI_IMAGE || !CURRENT_PACKAGE_VERSION) {
    throw new Error('Missing required environment variables')
  }

  initGitConfig(REPOSITORY)
  command`git fetch --no-tags origin ${MAIN_BRANCH}`.run()
  command`git checkout ${MAIN_BRANCH} -f`.run()
  command`git pull origin ${MAIN_BRANCH}`.run()

  const packageVersion = await getPackageVersion()

  if (!packageVersion) {
    throw new Error('Could not fetch Chrome package version')
  }

  const majorPackageVersion = getMajor(packageVersion)

  if (majorPackageVersion <= getMajor(CURRENT_PACKAGE_VERSION)) {
    printLog('Chrome is up to date.')
    return
  }

  const chromeVersionBranch = `bump-chrome-version-to-${majorPackageVersion}`
  const commitMessage = `👷 Bump chrome to ${packageVersion}`

  const isBranchAlreadyCreated = command`git ls-remote --heads ${REPOSITORY} ${chromeVersionBranch}`.run()
  if (isBranchAlreadyCreated) {
    printLog('Bump chrome branch already created.')
    return
  }

  command`git checkout -b ${chromeVersionBranch}`.run()

  printLog('Update versions...')
  await replaceCiFileVariable('CHROME_PACKAGE_VERSION', packageVersion)
  await replaceCiFileVariable('CURRENT_CI_IMAGE', String(Number(CURRENT_CI_IMAGE) + 1))

  command`git add ${CI_FILE}`.run()
  command`git commit -m ${commitMessage}`.run()
  command`git push origin ${chromeVersionBranch}`.run()

  printLog('Create PR...')

  const pullRequestUrl = createPullRequest(MAIN_BRANCH)
  printLog(`Chrome version bump PR created (from ${CURRENT_PACKAGE_VERSION} to ${packageVersion}).`)

  // used to share the pull request url to the notification jobs
  fs.appendFileSync('build.env', `BUMP_CHROME_PULL_REQUEST_URL=${pullRequestUrl}`)
})

async function getPackageVersion(): Promise<string | null> {
  const packagePage = await (await fetchHandlingError(CHROME_PACKAGE_URL)).text()
  const packageMatches = /<td>([0-9.-]+)<\/td>/.exec(packagePage)

  return packageMatches ? packageMatches[1] : null
}

function getMajor(version: string): number {
  const majorRegex = /^([0-9]+)./
  const majorMatches = majorRegex.exec(version)
  const major = majorMatches ? majorMatches[1] : null

  return Number(major)
}
