// This wrapper script waits until a BrowserStack parallel session is available before launching the
// test command, to avoid overloading the service and making tests more flaky than necessary. This
// is also handled by the CI (resource groups), but it is helpful when launching tests outside of
// the CI.
//
// It used to re-run the test command based on its output (in particular, when the BrowserStack
// session failed to be created), but we observed that:
//
// * The previous runner retried this kind of failure by recreating the BrowserStack connection.
//
// * Aborting the previous test command via SIGTERM was buggy and the command continued to run.

import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import browserStack from 'browserstack-local'
import { printLog, runMain, timeout, printError } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { browserStackRequest } from '../lib/bsUtils.ts'

const AVAILABILITY_CHECK_DELAY = 30_000
const NO_OUTPUT_TIMEOUT = 5 * 60_000
const BS_PLAN_URL = 'https://api.browserstack.com/automate/plan.json'

const bsLocal = new browserStack.Local()
const localIdentifier = `browser-sdk-${randomUUID()}`

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
  while (await isAtCapacity()) {
    const jitter = Math.floor(Math.random() * 3_000)
    printLog('All BrowserStack sessions occupied, waiting...')
    await timeout(AVAILABILITY_CHECK_DELAY + jitter)
  }
}

async function isAtCapacity(): Promise<boolean> {
  const plan = (await browserStackRequest(BS_PLAN_URL)) as {
    parallel_sessions_running: number
    parallel_sessions_max_allowed: number
  }
  return plan.parallel_sessions_running >= plan.parallel_sessions_max_allowed
}

function startBsLocal(): Promise<void> {
  printLog('Starting BrowserStackLocal...')

  return new Promise((resolve) => {
    bsLocal.start(
      {
        key: process.env.BS_ACCESS_KEY,
        localIdentifier,
        forceLocal: true,
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
        BROWSERSTACK_LOCAL_IDENTIFIER: localIdentifier,
      },
    })

    let output = ''
    let timeoutId = setTimeout(() => killIt('no output timeout'), NO_OUTPUT_TIMEOUT)
    child.stdout!.on('data', (data) => onOutput(data, process.stdout))
    child.stderr!.on('data', (data) => onOutput(data, process.stderr))

    child.on('exit', (code, signal) => {
      clearTimeout(timeoutId)
      // Only the test process owns the result. Inferring success from human-readable output can
      // hide setup, collection, reporter, or unhandled errors.
      resolve(!signal && code === 0)
    })
    child.on('error', (error) => {
      clearTimeout(timeoutId)
      printError('Unable to start the BrowserStack test process:', error)
      resolve(false)
    })

    function onOutput(data: Buffer | string, destination: NodeJS.WriteStream): void {
      const chunk = redactBrowserStackCredentials(data.toString())
      output += chunk
      destination.write(chunk)

      clearTimeout(timeoutId)

      if (hasUnrecoverableFailure(output)) {
        killIt('unrecoverable failure')
      } else {
        timeoutId = setTimeout(() => killIt('no output timeout'), NO_OUTPUT_TIMEOUT)
      }
    }

    function killIt(message: string): void {
      printError(`Killing the browserstack job because of ${message}`)
      child.kill('SIGKILL')
    }
  })
}

function redactBrowserStackCredentials(output: string): string {
  let redactedOutput = output
  for (const credential of [process.env.BS_USERNAME, process.env.BS_ACCESS_KEY]) {
    if (credential) {
      redactedOutput = redactedOutput.replaceAll(credential, '[REDACTED]')
    }
  }
  return redactedOutput
}

function hasUnrecoverableFailure(stdout: string): boolean {
  return stdout.includes('is set to true but local testing through BrowserStack is not connected.')
}
