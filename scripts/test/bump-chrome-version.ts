import fs from 'fs'
import { printLog, runMain, fetchHandlingError } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { CI_FILE, replaceCiFileVariable } from '../lib/filesUtils.ts'
import { initGitConfig } from '../lib/gitUtils.ts'
import { getGithubAccessToken } from '../lib/secrets.ts'

const REPOSITORY = process.env.GIT_REPOSITORY
const MAIN_BRANCH = process.env.MAIN_BRANCH
const CURRENT_CI_IMAGE = process.env.CURRENT_CI_IMAGE

const CURRENT_PACKAGE_VERSION = process.env.CHROME_PACKAGE_VERSION
const CHROME_PACKAGE_URL = 'https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable'

runMain(async () => {
  initGitConfig(REPOSITORY!)
  command`git fetch --no-tags origin ${MAIN_BRANCH}`.run()
  command`git checkout ${MAIN_BRANCH} -f`.run()
  command`git pull origin ${MAIN_BRANCH}`.run()

  const packageVersion = await getPackageVersion()
  const majorPackageVersion = getMajor(packageVersion)

  if (majorPackageVersion <= getMajor(CURRENT_PACKAGE_VERSION!)) {
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
  await replaceCiFileVariable('CHROME_PACKAGE_VERSION', packageVersion!)
  await replaceCiFileVariable('CURRENT_CI_IMAGE', (Number(CURRENT_CI_IMAGE!) + 1).toString())

  command`git add ${CI_FILE}`.run()
  command`git commit -m ${commitMessage}`.run()
  command`git push origin ${chromeVersionBranch}`.run()

  printLog('Create PR...')

  const pullRequestUrl = createPullRequest()
  printLog(`Chrome version bump PR created (from ${CURRENT_PACKAGE_VERSION} to ${packageVersion}).`)

  // used to share the pull request url to the notification jobs
  fs.appendFileSync('build.env', `BUMP_CHROME_PULL_REQUEST_URL=${pullRequestUrl}`)
})

async function getPackageVersion(): Promise<string | null> {
  const packagePage = await (await fetchHandlingError(CHROME_PACKAGE_URL)).text()
  const packageMatches = /<td>([0-9.-]+)<\/td>/.exec(packagePage)

  return packageMatches ? packageMatches[1] : null
}

function getMajor(version: string | null): number {
  if (!version) {
    return 0
  }
  const majorRegex = /^([0-9]+)./
  const majorMatches = majorRegex.exec(version)
  const major = majorMatches ? majorMatches[1] : null

  return Number(major)
}

function createPullRequest(): string {
  command`gh auth login --with-token`.withInput(getGithubAccessToken()).run()
  const pullRequestUrl = command`gh pr create --fill --base ${MAIN_BRANCH}`.run()
  return pullRequestUrl.trim()
}
