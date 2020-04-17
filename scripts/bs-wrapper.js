'use strict'

const execSync = require('child_process').execSync
const request = require('request')

const AVAILABILITY_CHECK_DELAY = 30_000
const RUNNING_BUILDS_API = `https://${process.env.BS_USERNAME}:${process.env.BS_ACCESS_KEY}@api.browserstack.com/automate/builds.json?status=running`

async function main() {
  await waitForAvailability()
  execSync(`yarn ${process.argv.slice(2).join(' ')}`, { stdio: 'inherit' })
}

async function waitForAvailability() {
  while (await hasRunningBuild()) {
    console.log('other build running, waiting...')
    await timeout(AVAILABILITY_CHECK_DELAY)
  }
}

function hasRunningBuild() {
  return new Promise((resolve, reject) => {
    request.get(RUNNING_BUILDS_API, (error, __, body) => {
      if (error) {
        reject(error)
      }
      resolve(body !== '[]')
    })
  })
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
