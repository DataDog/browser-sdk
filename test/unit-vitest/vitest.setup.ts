/// <reference path="./providedContext.d.ts" />
import { beforeEach, chai, expect, inject, onTestFinished } from 'vitest'

// Record assertion failures before throwing them, so the test still fails if the code under test
// catches the error (ex: `callMonitored(() => expect(...))`). Recorded failures that were not
// reported are checked once the test finishes (see below).
// With `isolate: false`, this file runs again for each spec file in the same page: patch only once.
const FAILURES_OF_CURRENT_TEST = Symbol.for('vitest.setup.failuresOfCurrentTest')
const failuresOfCurrentTest: Error[] = ((window as any)[FAILURES_OF_CURRENT_TEST] ??= recordAssertionFailures())

function recordAssertionFailures() {
  const failures: Error[] = []
  const record = <F extends (...args: any[]) => any>(fn: F) =>
    function (this: unknown, ...args: Parameters<F>): ReturnType<F> {
      try {
        return fn.apply(this, args) as ReturnType<F>
      } catch (error) {
        failures.push(error as Error)
        throw error
      }
    }
  // Vitest matchers call `assert()` of chai's `Assertion` to report their result. `record()` keeps
  // the `this` it is called with.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  chai.Assertion.prototype.assert = record(chai.Assertion.prototype.assert)
  expect.unreachable = record(expect.unreachable)
  return failures
}

// Fail tests that call console methods without spying on them, to keep the test output clean.
// Calls made after a test ends are reported by the next test.
// Like above, patch the console only once, and share the calls across spec files so none is lost
// between two files.
const UNEXPECTED_CONSOLE_CALLS = Symbol.for('vitest.setup.unexpectedConsoleCalls')
const unexpectedConsoleCalls: string[] | undefined = inject('failOnUnexpectedConsoleCalls')
  ? ((window as any)[UNEXPECTED_CONSOLE_CALLS] ??= trackConsoleCalls())
  : undefined

function trackConsoleCalls() {
  const calls: string[] = []
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const originalMethod = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      calls.push(`${method}: ${args.map(String).join(' ')}`)
      originalMethod(...args)
    }
  }
  return calls
}

// `onTestFinished` hooks run in reverse order: registering these before the `registerCleanupTask()`
// tasks makes them run after, as cleanups can fail expectations or call console methods too.
beforeEach(() => {
  failuresOfCurrentTest.length = 0
  onTestFinished(({ task }) => {
    const reportedMessages = task.result?.errors?.map((error) => error.message) ?? []
    // Only report the first unreported failure: the following ones are usually consequences of it
    const unreportedFailure = failuresOfCurrentTest.find((error) => !reportedMessages.includes(error.message))
    failuresOfCurrentTest.length = 0
    if (unreportedFailure) {
      throw unreportedFailure
    }
  })
  onTestFinished(() => {
    if (unexpectedConsoleCalls?.length) {
      throw new Error(`Unexpected console calls:\n${unexpectedConsoleCalls.splice(0).join('\n')}`)
    }
  })
})
