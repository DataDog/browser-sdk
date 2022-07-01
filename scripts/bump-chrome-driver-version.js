'use strict'

const {
  printLog,
  printError,
  logAndExit,
  executeCommand,
  replaceCiVariable,
  initGitConfig,
  getSecretKey,
  fetch,
  CI_FILE,
} = require('./utils')

const REPOSITORY = process.env.GIT_REPOSITORY
const MAIN_BRANCH = process.env.MAIN_BRANCH
const CURRENT_CI_IMAGE = process.env.CURRENT_CI_IMAGE

const CURRENT_PACKAGE_VERSION = process.env.CHROME_PACKAGE_VERSION
const CHROME_PACKAGE_URL = 'https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable'
const CHROME_DRIVER_URL = 'https://chromedriver.storage.googleapis.com/?delimiter=/&prefix='

async function main() {
  await initGitConfig(REPOSITORY)
  await executeCommand(`git fetch --no-tags origin ${MAIN_BRANCH}`)
  await executeCommand(`git checkout ${MAIN_BRANCH} -f`)
  await executeCommand(`git pull origin ${MAIN_BRANCH}`)

  const packageVersion = await getPackageVersion()
  const majorPackageVersion = getMajor(packageVersion)

  if (majorPackageVersion <= getMajor(CURRENT_PACKAGE_VERSION)) {
    printLog('Chrome driver is up to date.')
    process.exit()
  }

  const driverVersion = await getDriverVersion(majorPackageVersion)

  if (majorPackageVersion !== getMajor(driverVersion)) {
    printError(`No driver available for chrome ${packageVersion}.`)
    process.exit()
  }

  const chromeVersionBranch = `bump-chrome-version-to-${driverVersion}`
  const commitMessage = `👷 Bump chrome to ${packageVersion}`

  const isBranchAlreadyCreated = await executeCommand(`git ls-remote --heads ${REPOSITORY} ${chromeVersionBranch}`)
  if (isBranchAlreadyCreated) {
    printLog('Bump chrome branch already created.')
    process.exit()
  }

  await executeCommand(`git checkout -b ${chromeVersionBranch}`)

  printLog('Update versions...')
  await replaceCiVariable('CHROME_DRIVER_VERSION', driverVersion)
  await replaceCiVariable('CHROME_PACKAGE_VERSION', packageVersion)
  await replaceCiVariable('CURRENT_CI_IMAGE', Number(CURRENT_CI_IMAGE) + 1)

  await executeCommand(`git add ${CI_FILE}`)
  await executeCommand(`git commit -m "${commitMessage}"`)
  await executeCommand(`git push origin ${chromeVersionBranch}`)

  printLog('Create PR...')

  const pullRequestUrl = await createPullRequest()
  printLog(`Chrome version bump PR created (from ${CURRENT_PACKAGE_VERSION} to ${packageVersion}).`)

  // used to share the pull request url to the notification jobs
  await executeCommand(`echo "BUMP_CHROME_PULL_REQUEST_URL=${pullRequestUrl}" >> build.env`)
}

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

async function createPullRequest() {
  const githubAccessToken = await getSecretKey('ci.browser-sdk.github_access_token')
  await executeCommand(`echo "${githubAccessToken}" | gh auth login --with-token`)
  const pullRequestUrl = await executeCommand(`gh pr create --fill --base ${MAIN_BRANCH}`)
  return pullRequestUrl.trim()
}

main().catch(logAndExit)
