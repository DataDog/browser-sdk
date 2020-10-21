'use strict'

const exec = require('child_process').exec
const request = require('request')

const AVAILABILITY_CHECK_DELAY = 30_000
const RUNNING_BUILDS_API = `https://${process.env.BS_USERNAME}:${process.env.BS_ACCESS_KEY}@api.browserstack.com/automate/builds.json?status=running`
const COMMAND = `yarn ${process.argv.slice(2).join(' ')}`
const RETRY_DELAY = 30_000
const MAX_RETRY_COUNT = 3

const TEST_STATUS_DEFINITIVE_FAILURE = 'definitive_failure'
const TEST_STATUS_RECOVERABLE_FAILURE = 'recoverable_failure'
const TEST_STATUS_SUCCESS = 'success'

main()
  .then((status) => process.exit(status === TEST_STATUS_SUCCESS ? 0 : 1))
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })

async function main() {
  for (let retryCount = 0; retryCount < MAX_RETRY_COUNT; retryCount += 1) {
    await waitForAvailability()
    const status = await runTests()
    if (status !== TEST_STATUS_RECOVERABLE_FAILURE) {
      return status
    }
    console.log('tests failed, waiting to retry...')
    await timeout(RETRY_DELAY)
  }
  return TEST_STATUS_DEFINITIVE_FAILURE
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

function runTests() {
  return new Promise((resolve) => {
    let logs = ''
    const current = exec(COMMAND)
    current.stdout.pipe(process.stdout)
    current.stdout.on('data', (data) => {
      logs += data

      if (hasSessionCreationFailure(logs)) {
        current.kill('SIGTERM')
      }
    })

    current.on('exit', (code) => {
      if (code === 0) {
        resolve(TEST_STATUS_SUCCESS)
      } else if (hasSessionCreationFailure(logs)) {
        resolve(TEST_STATUS_RECOVERABLE_FAILURE)
      } else {
        resolve(TEST_STATUS_DEFINITIVE_FAILURE)
      }
    })
  })
}

function hasSessionCreationFailure(logs) {
  return logs.includes('@wdio/runner: Error: Failed to create session')
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
