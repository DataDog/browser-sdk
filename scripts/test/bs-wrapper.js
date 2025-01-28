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

const spawn = require('child_process').spawn
const browserStack = require('browserstack-local')
const { printLog, runMain, timeout, printError } = require('../lib/executionUtils')
const { command } = require('../lib/command')
const { browserStackRequest } = require('../lib/bsUtils')

const AVAILABILITY_CHECK_DELAY = 30_000
const NO_OUTPUT_TIMEOUT = 5 * 60_000
const BS_BUILD_URL = 'https://api.browserstack.com/automate/builds.json?status=running'

runMain(async () => {
  if (command`git tag --points-at HEAD`.run()) {
    printLog('Skip bs execution on tags')
    return
  }

  if (!process.env.BS_USERNAME || !process.env.BS_ACCESS_KEY) {
    printError('Missing Browserstack credentials (BS_ACCESS_KEY and BS_USERNAME env variables)')
    return
  }

  await waitForAvailability()
  await startBsLocal()
  const isSuccess = await runTests()
  await stopBsLocal()
  process.exit(isSuccess ? 0 : 1)
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

const bsLocal = new browserStack.Local()

function startBsLocal() {
  printLog('Starting BrowserStackLocal...')

  return new Promise((resolve) => {
    bsLocal.start(
      {
        key: process.env.BS_ACCESS_KEY,
        forceLocal: true,
        forceKill: true,
        onlyAutomate: true,
      },
      (error) => {
        if (error) {
          printError('Failed to start BrowserStackLocal:', error)
          process.exit(1)
        }
        printLog('BrowserStackLocal started', bsLocal.isRunning())
        resolve()
      }
    )
  })
}

function stopBsLocal() {
  return new Promise((resolve) => {
    bsLocal.stop(() => {
      resolve()
    })
  })
}

function runTests() {
  return new Promise((resolve) => {
    const [command, ...args] = process.argv.slice(2)

    const child = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: true },
    })

    let output = ''
    let timeoutId

    child.stdout.pipe(process.stdout)
    child.stdout.on('data', onOutput)

    child.stderr.pipe(process.stderr)
    child.stderr.on('data', onOutput)

    child.on('exit', (code, signal) => {
      resolve(!signal && code === 0)
    })

    function onOutput(data) {
      output += data

      clearTimeout(timeoutId)

      if (hasUnrecoverableFailure(output)) {
        killIt('unrecoverable failure')
      } else {
        timeoutId = setTimeout(() => killIt('no output timeout'), NO_OUTPUT_TIMEOUT)
      }
    }

    function killIt(message) {
      printError(`Killing the browserstack job because of ${message}`)
      child.kill('SIGTERM')
    }
  })
}

function hasUnrecoverableFailure(stdout) {
  return stdout.includes('is set to true but local testing through BrowserStack is not connected.')
}
