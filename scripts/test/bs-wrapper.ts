// This wrapper script waits until a BrowserStack parallel session is available before launching the
// test command, to avoid overloading the service and making tests more flaky than necessary. This
// is also handled by the CI (resource groups), but it is helpful when launching tests outside of
// the CI.
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

import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import browserStack from 'browserstack-local'
import { printLog, runMain, timeout, printError } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { browserStackRequest } from '../lib/bsUtils.ts'

const AVAILABILITY_CHECK_DELAY = 30_000
const NO_OUTPUT_TIMEOUT = 5 * 60_000
// After all Vitest sessions finish, the orchestrator may hang indefinitely (vitest#10151).
// Force-exit after this delay and treat it as success if no test failures were detected.
const POST_COMPLETION_TIMEOUT = 30_000
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
    let timeoutId: NodeJS.Timeout
    let testsCompleted = false
    let hasFailures = false

    child.stdout!.pipe(process.stdout)
    child.stdout!.on('data', onOutput)

    child.stderr!.pipe(process.stderr)
    child.stderr!.on('data', onOutput)

    child.on('exit', (code, signal) => {
      if (testsCompleted && !hasFailures) {
        // Vitest hung after completion (vitest#10151) — treat as success
        resolve(true)
      } else {
        resolve(!signal && code === 0)
      }
    })

    function onOutput(data: Buffer | string): void {
      const chunk = data.toString()
      output += chunk

      // Once tests are done, don't reset the force-kill countdown
      if (testsCompleted) {
        return
      }

      // Match Vitest's failure summary line (e.g. "Test Files  2 failed | 40 passed")
      // but not test console output like "Session Replay failed to start"
      if (/\d+ failed/.test(chunk)) {
        hasFailures = true
      }

      clearTimeout(timeoutId)

      if (hasUnrecoverableFailure(output)) {
        killIt('unrecoverable failure')
      } else if (output.includes('no more tests to run')) {
        testsCompleted = true
        printLog('Tests completed, waiting for Vitest to exit...')
        timeoutId = setTimeout(() => killIt('post-completion hang (vitest#10151)'), POST_COMPLETION_TIMEOUT)
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

function hasUnrecoverableFailure(stdout: string): boolean {
  return stdout.includes('is set to true but local testing through BrowserStack is not connected.')
}
