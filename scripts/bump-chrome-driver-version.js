'use strict'

const request = require('request')

const { printLog, printError, logAndExit, replaceCiVariable, initGitConfig, executeCommand } = require('./utils')

const CI_FILE = '.gitlab-ci.yml'
const REPOSITORY = process.env.GIT_REPOSITORY
const MAIN_BRANCH = 'aymeric/auto-chrome-version-bump' //process.env.MAIN_BRANCH

const CURRENT_PACKAGE_VERSION = process.env.CHROME_PACKAGE_VERSION
const CHROME_PACKAGE_URL = 'https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable'
const CHROME_DRIVER_URL = 'https://chromedriver.storage.googleapis.com/?delimiter=/&prefix='

async function main() {
  await initGitConfig(REPOSITORY)
  await executeCommand(`git fetch --no-tags origin ${MAIN_BRANCH}`)
  await executeCommand(`git checkout ${MAIN_BRANCH} -f`)
  await executeCommand(`git pull origin ${MAIN_BRANCH}`)

  const packageVersion = await getPackageVersion()

  if (packageVersion <= CURRENT_PACKAGE_VERSION) {
    printLog(`Chrome driver is up to date.`)
    process.exit()
  }

  const driverVersion = await getDriverVersion(packageVersion)

  if (getMajor(packageVersion) !== getMajor(driverVersion)) {
    printError(`No driver available for chrome ${packageVersion}.`)
    process.exit(1)
  }

  const chromeVersionBranch = `bump-chrome-version-to-${driverVersion}`
  const commitMessage = `👷 Bump chrome to ${packageVersion}`
  await executeCommand(`git checkout -b ${chromeVersionBranch}`)

  await replaceCiVariable('CHROME_DRIVER_VERSION', driverVersion)
  await replaceCiVariable('CHROME_PACKAGE_VERSION', packageVersion)

  await executeCommand(`git add ${CI_FILE}`)
  await executeCommand(`git commit -m "${commitMessage}"`)
  await executeCommand(`git push origin ${chromeVersionBranch}`)

  await createPullRequest(commitMessage, chromeVersionBranch)

  printLog(`Chrome version bump PR created (from ${CURRENT_PACKAGE_VERSION} to ${packageVersion}).`)
}

async function getPackageVersion() {
  const packagePage = await fetch(CHROME_PACKAGE_URL)
  const packageMatches = /<td>([0-9.-]+)<\/td>/.exec(packagePage)

  return packageMatches ? packageMatches[1] : null
}

async function getDriverVersion(packageVersion) {
  const driverPage = await fetch(`${CHROME_DRIVER_URL}${getMajor(packageVersion)}`)
  const driverMatchGroups = [...driverPage.toString().matchAll(/<Prefix>([0-9.-]+)\/<\/Prefix>/g)]

  return driverMatchGroups.length ? driverMatchGroups[driverMatchGroups.length - 1][1] : null
}

function getMajor(version) {
  const majorRegex = /^([0-9]+)./
  const majorMatches = majorRegex.exec(version)
  const major = majorMatches ? majorMatches[1] : null

  return major
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    request.get(url, (error, httpResponse, body) => {
      if (error) {
        reject(error)
      }
      if (httpResponse.statusCode >= 400 && httpResponse.statusCode < 500) {
        reject(httpResponse.body)
      }
      resolve(body)
    })
  })
}

function createPullRequest(title, branch) {
  return new Promise((resolve, reject) => {
    const options = {
      url: 'https://api.github.com/repos/DataDog/browser-sdk/pulls',
      headers: {
        'User-Agent': 'request',
        accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        title: title,
        head: branch,
        base: MAIN_BRANCH,
      }),
      method: 'POST',
    }

    request(options, (error, httpResponse, body) => {
      if (error) {
        reject(error)
      }
      if (httpResponse.statusCode >= 400 && httpResponse.statusCode < 500) {
        reject(httpResponse.body)
      }
      resolve(body)
    })
  })
}

main().catch(logAndExit)
