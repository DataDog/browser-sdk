/// <reference path="./providedContext.d.ts" />
import { beforeEach, inject, onTestFinished } from 'vitest'

// Fail tests that call console methods without spying on them, to keep the test output clean.
// Calls made after a test ends are reported by the next test.
// With `isolate: false`, this file runs again for each spec file in the same page: patch the console
// only once, and share the calls across spec files so none is lost between two files.
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

// Registered before the `registerCleanupTask()` tasks, this `onTestFinished` hook runs after them
// (they run in reverse order), as cleanups can call console methods too.
beforeEach(() => {
  onTestFinished(() => {
    if (unexpectedConsoleCalls?.length) {
      throw new Error(`Unexpected console calls:\n${unexpectedConsoleCalls.splice(0).join('\n')}`)
    }
  })
})
