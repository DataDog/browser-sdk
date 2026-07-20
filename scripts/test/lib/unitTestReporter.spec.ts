import assert from 'node:assert'
import { afterEach, describe, it, mock } from 'node:test'
import type { TestCase, TestModule } from 'vitest/node'
import { recordUnexpectedConsoleLog, UnitTestReporter } from './unitTestReporter.ts'

const initialExitCode = process.exitCode

afterEach(() => {
  process.exitCode = initialExitCode
  mock.restoreAll()
})

describe('UnitTestReporter', () => {
  it('fails the run when a test writes unexpected console output', () => {
    const reporter = new UnitTestReporter()
    const consoleError = mock.method(console, 'error', () => undefined)
    reporter.onTestRunStart()

    recordUnexpectedConsoleLog('unexpected', 'stderr', makeTestCase())
    reporter.onTestRunEnd()

    assert.equal(process.exitCode, 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /Unexpected console calls/)
  })

  it('allows console output when the test opts in explicitly', () => {
    const reporter = new UnitTestReporter()
    const consoleError = mock.method(console, 'error', () => undefined)
    reporter.onTestRunStart()

    recordUnexpectedConsoleLog('expected', 'stderr', makeTestCase({ allowUnexpectedConsoleLogs: true }))
    reporter.onTestRunEnd()

    assert.equal(process.exitCode, initialExitCode)
    assert.equal(consoleError.mock.callCount(), 0)
  })

  it('fails the run when test names are duplicated', () => {
    const reporter = new UnitTestReporter()
    const consoleError = mock.method(console, 'error', () => undefined)
    const testCase = makeTestCase()
    const testModule = {
      children: { allTests: () => [testCase, testCase] },
    } as unknown as TestModule
    reporter.onTestRunStart()

    reporter.onTestModuleCollected(testModule)
    reporter.onTestRunEnd()

    assert.equal(process.exitCode, 1)
    assert.match(String(consoleError.mock.calls[0].arguments[0]), /Duplicate tests/)
  })
})

function makeTestCase(meta: Record<string, unknown> = {}): TestCase {
  return {
    type: 'test',
    fullName: 'suite > test',
    module: { moduleId: 'feature.spec.ts' },
    project: { name: 'chromium' },
    meta: () => meta,
  } as unknown as TestCase
}
