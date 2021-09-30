'use strict'
// This wrapper script ensures that no other test is running in BrowserStack before launching the
// test command, to avoid overloading the service and making tests more flaky than necessary. This
// is also handled by the CI (exclusive lock on the "browserstack" resource), but it is helpful when
// launching tests outside of the CI.
//
// It used to re-run the test command based on its output (in particular, when the BrowserStack
// session failed to be created), but we observed that:
//
// * The retry logic of karma and wdio was more efficient to retry this kind of tests (the
// BrowserStack connection is re-created on each retry)
//
// * Aborting the test command via a SIGTERM signal was buggy and the command continued to run even
// after killing it. There might be a better way of prematurely aborting the test command if we need
// to in the future.

const request = require('request')
const { spawnCommand, printLog, logAndExit } = require('./utils')

const AVAILABILITY_CHECK_DELAY = 30_000
// eslint-disable-next-line max-len
const RUNNING_BUILDS_API = `https://${process.env.BS_USERNAME}:${process.env.BS_ACCESS_KEY}@api.browserstack.com/automate/builds.json?status=running`

async function main() {
  await waitForAvailability()
  const exitCode = await runTests()
  process.exit(exitCode)
}

async function waitForAvailability() {
  while (await hasRunningBuild()) {
    printLog('Other build running, waiting...')
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
  const [command, ...args] = process.argv.slice(2)
  return spawnCommand(command, args)
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch(logAndExit)
