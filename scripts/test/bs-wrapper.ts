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

import { spawn, type ChildProcess } from 'node:child_process'
import browserStack from 'browserstack-local'
import { printLog, runMain, timeout, printError } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { browserStackRequest } from '../lib/bsUtils.ts'

const AVAILABILITY_CHECK_DELAY = 30_000
const NO_OUTPUT_TIMEOUT = 5 * 60_000
const BS_BUILD_URL = 'https://api.browserstack.com/automate/builds.json?status=running'

const bsLocal = new browserStack.Local()

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

async function waitForAvailability(): Promise<void> {
  while (await hasRunningBuild()) {
    printLog('Other build running, waiting...')
    await timeout(AVAILABILITY_CHECK_DELAY)
  }
}

async function hasRunningBuild(): Promise<boolean> {
  const builds = (await browserStackRequest(BS_BUILD_URL)) as any[]
  return builds.length > 0
}

function startBsLocal(): Promise<void> {
  printLog('Starting BrowserStackLocal...')

  return new Promise((resolve) => {
    bsLocal.start(
      {
        key: process.env.BS_ACCESS_KEY,
        forceLocal: true,
        forceKill: true,
        onlyAutomate: true,
      },
      (error?: Error) => {
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

function stopBsLocal(): Promise<void> {
  return new Promise((resolve) => {
    bsLocal.stop(() => {
      printLog('BrowserStackLocal stopped')
      resolve()
    })
  })
}

function runTests(): Promise<boolean> {
  return new Promise((resolve) => {
    const [command, ...args] = process.argv.slice(2)

    const child: ChildProcess = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: 'true',
        BROWSER_STACK: 'true',
      },
    })

    let output = ''
    let timeoutId: NodeJS.Timeout

    child.stdout!.pipe(process.stdout)
    child.stdout!.on('data', onOutput)

    child.stderr!.pipe(process.stderr)
    child.stderr!.on('data', onOutput)

    child.on('exit', (code, signal) => {
      resolve(!signal && code === 0)
    })

    function onOutput(data: Buffer | string): void {
      output += data.toString()

      clearTimeout(timeoutId)

      if (hasUnrecoverableFailure(output)) {
        killIt('unrecoverable failure')
      } else {
        timeoutId = setTimeout(() => killIt('no output timeout'), NO_OUTPUT_TIMEOUT)
      }
    }

    function killIt(message: string): void {
      printError(`Killing the browserstack job because of ${message}`)
      // use 'SIGKILL' instead of 'SIGTERM' because Karma intercepts 'SIGTERM' and terminates the process with a 0 exit code,
      // which is not what we want here (we want to indicate a failure).
      // see https://github.com/karma-runner/karma/blob/master/lib/server.js#L391
      child.kill('SIGKILL')
    }
  })
}

function hasUnrecoverableFailure(stdout: string): boolean {
  return stdout.includes('is set to true but local testing through BrowserStack is not connected.')
}
