'use strict'

const https = require('https')
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
  await executeCommand(`git checkout -b ${chromeVersionBranch}`)

  await replaceCiVariable('CHROME_DRIVER_VERSION', driverVersion)
  await replaceCiVariable('CHROME_PACKAGE_VERSION', packageVersion)

  await executeCommand(`git add ${CI_FILE}`)
  await executeCommand(`git commit -m "👷 Bump chrome to ${packageVersion}"`)
  await executeCommand(`git push origin ${chromeVersionBranch}`)
  await createPullRequest(chromeVersionBranch)

  printLog(`Chrome version bump PR created (from ${CURRENT_PACKAGE_VERSION} to ${packageVersion}).`)
}

async function getPackageVersion() {
  const packagePage = await doRequest(CHROME_PACKAGE_URL)
  const packageMatches = /<td>([0-9.-]+)<\/td>/.exec(packagePage)

  return packageMatches ? packageMatches[1] : null
}

async function getDriverVersion(packageVersion) {
  const driverPage = await doRequest(`${CHROME_DRIVER_URL}${getMajor(packageVersion)}`)
  const driverMatchGroups = [...driverPage.toString().matchAll(/<Prefix>([0-9.-]+)\/<\/Prefix>/g)]

  return driverMatchGroups.length ? driverMatchGroups[driverMatchGroups.length - 1][1] : null
}

function getMajor(version) {
  const majorRegex = /^([0-9]+)./
  const majorMatches = majorRegex.exec(version)
  const major = majorMatches ? majorMatches[1] : null

  return major
}

function doRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, (res) => {
      console.log(`statusCode: ${res.statusCode}`)

      res.on('data', resolve)
    })
    req.on('error', reject)
    req.end()
  })
}

function createPullRequest(branch) {
  return new Promise((resolve, reject) => {
    request.post(
      `https://api.github.com/repos/DataDog/browser-sdk/pulls`,
      {
        head: branch,
        base: MAIN_BRANCH,
        body: 'coucou test',
      },
      (error, { result }) => {
        if (error) {
          reject(error)
        }
        resolve(result)
      }
    )
  })
}

main().catch(logAndExit)
