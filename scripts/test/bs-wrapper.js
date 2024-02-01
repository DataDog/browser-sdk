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

const { spawnCommand, printLog, runMain, timeout } = require('../lib/execution-utils')
const { command } = require('../lib/command')
const { browserStackRequest } = require('../lib/bs-utils')

const AVAILABILITY_CHECK_DELAY = 30_000
const BS_BUILD_URL = 'https://api.browserstack.com/automate/builds.json?status=running'

runMain(async () => {
  if (command`git tag --points-at HEAD`.run()) {
    printLog('Skip bs execution on tags')
    return
  }
  await waitForAvailability()
  const exitCode = await runTests()
  process.exit(exitCode)
})

async function waitForAvailability() {
  while (await hasRunningBuild()) {
    printLog('Other build running, waiting...')
    await timeout(AVAILABILITY_CHECK_DELAY)
  }
}

async function hasRunningBuild() {
  return (await browserStackRequest(BS_BUILD_URL)).length > 0
}

function runTests() {
  const [command, ...args] = process.argv.slice(2)
  return spawnCommand(command, args)
}
