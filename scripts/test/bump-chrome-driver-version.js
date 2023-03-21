'use strict'

const fs = require('fs')
const {
  printLog,
  printError,
  runMain,
  command,
  replaceCiFileVariable,
  initGitConfig,
  getSecretKey,
  fetch,
  CI_FILE,
} = require('../lib/utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const MAIN_BRANCH = process.env.MAIN_BRANCH
const CURRENT_CI_IMAGE = process.env.CURRENT_CI_IMAGE

const CURRENT_PACKAGE_VERSION = process.env.CHROME_PACKAGE_VERSION
const CHROME_PACKAGE_URL = 'https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable'
const CHROME_DRIVER_URL = 'https://chromedriver.storage.googleapis.com/?delimiter=/&prefix='

runMain(async () => {
  initGitConfig(REPOSITORY)
  command`git fetch --no-tags origin ${MAIN_BRANCH}`.run()
  command`git checkout ${MAIN_BRANCH} -f`.run()
  command`git pull origin ${MAIN_BRANCH}`.run()

  const packageVersion = await getPackageVersion()
  const majorPackageVersion = getMajor(packageVersion)

  if (majorPackageVersion <= getMajor(CURRENT_PACKAGE_VERSION)) {
    printLog('Chrome driver is up to date.')
    return
  }

  const driverVersion = await getDriverVersion(majorPackageVersion)

  if (majorPackageVersion !== getMajor(driverVersion)) {
    printError(`No driver available for chrome ${packageVersion}.`)
    return
  }

  const chromeVersionBranch = `bump-chrome-version-to-${driverVersion}`
  const commitMessage = `👷 Bump chrome to ${packageVersion}`

  const isBranchAlreadyCreated = command`git ls-remote --heads ${REPOSITORY} ${chromeVersionBranch}`.run()
  if (isBranchAlreadyCreated) {
    printLog('Bump chrome branch already created.')
    return
  }

  command`git checkout -b ${chromeVersionBranch}`.run()

  printLog('Update versions...')
  await replaceCiFileVariable('CHROME_DRIVER_VERSION', driverVersion)
  await replaceCiFileVariable('CHROME_PACKAGE_VERSION', packageVersion)
  await replaceCiFileVariable('CURRENT_CI_IMAGE', Number(CURRENT_CI_IMAGE) + 1)

  command`git add ${CI_FILE}`.run()
  command`git commit -m ${commitMessage}`.run()
  command`git push origin ${chromeVersionBranch}`.run()

  printLog('Create PR...')

  const pullRequestUrl = createPullRequest()
  printLog(`Chrome version bump PR created (from ${CURRENT_PACKAGE_VERSION} to ${packageVersion}).`)

  // used to share the pull request url to the notification jobs
  fs.appendFileSync('build.env', `BUMP_CHROME_PULL_REQUEST_URL=${pullRequestUrl}`)
})

async function getPackageVersion() {
  const packagePage = await fetch(CHROME_PACKAGE_URL)
  const packageMatches = /<td>([0-9.-]+)<\/td>/.exec(packagePage)

  return packageMatches ? packageMatches[1] : null
}

async function getDriverVersion(majorPackageVersion) {
  const driverPage = await fetch(`${CHROME_DRIVER_URL}${majorPackageVersion}`)
  const driverMatchGroups = [...driverPage.toString().matchAll(/<Prefix>([0-9.-]+)\/<\/Prefix>/g)]

  return driverMatchGroups.length ? driverMatchGroups[driverMatchGroups.length - 1][1] : null
}

function getMajor(version) {
  const majorRegex = /^([0-9]+)./
  const majorMatches = majorRegex.exec(version)
  const major = majorMatches ? majorMatches[1] : null

  return Number(major)
}

function createPullRequest() {
  const githubAccessToken = getSecretKey('ci.browser-sdk.github_access_token')
  command`gh auth login --with-token`.withInput(githubAccessToken).run()
  const pullRequestUrl = command`gh pr create --fill --base ${MAIN_BRANCH}`.run()
  return pullRequestUrl.trim()
}
