import type { Reporter, TestCase, TestModule, TestSuite } from 'vitest/node'

interface UnexpectedConsoleLog {
  entity: TestModule | TestSuite | TestCase | undefined
  log: string
  type: 'stderr' | 'stdout'
}

const unexpectedConsoleLogs: UnexpectedConsoleLog[] = []

/**
 * Record test console output so CI can reject it after reporters have written their results.
 */
export function recordUnexpectedConsoleLog(
  log: string,
  type: UnexpectedConsoleLog['type'],
  entity: TestModule | TestSuite | TestCase | undefined
): void {
  // Task metadata is synchronized after the test finishes, so defer the opt-in check until the
  // run ends instead of deciding while the console call is being streamed.
  unexpectedConsoleLogs.push({ entity, log, type })
}

export class UnitTestReporter implements Reporter {
  private testNames = new Set<string>()
  private duplicateTestNames = new Set<string>()

  onTestRunStart(): void {
    this.testNames.clear()
    this.duplicateTestNames.clear()
    unexpectedConsoleLogs.length = 0
  }

  onTestModuleCollected(testModule: TestModule): void {
    for (const testCase of testModule.children.allTests()) {
      const testName = `${testCase.project.name}:${testCase.fullName}`
      if (this.testNames.has(testName)) {
        this.duplicateTestNames.add(testName)
      }
      this.testNames.add(testName)
    }
  }

  onTestRunEnd(): void {
    if (this.duplicateTestNames.size > 0) {
      process.exitCode = 1
      console.error(`Duplicate tests:\n${[...this.duplicateTestNames].sort().join('\n')}`)
    }

    const remainingConsoleLogs = unexpectedConsoleLogs.filter(({ entity }) => !allowsConsoleLogs(entity))
    if (remainingConsoleLogs.length > 0) {
      process.exitCode = 1
      console.error(
        `Unexpected console calls:\n${remainingConsoleLogs
          .map(({ entity, log, type }) => `${formatEntity(entity)}\n${type}: ${log}`)
          .join('\n')}`
      )
    }
  }
}

function allowsConsoleLogs(entity: TestModule | TestSuite | TestCase | undefined): boolean {
  return Boolean(
    entity?.type === 'test' && (entity.meta() as { allowUnexpectedConsoleLogs?: boolean }).allowUnexpectedConsoleLogs
  )
}

function formatEntity(entity: TestModule | TestSuite | TestCase | undefined): string {
  if (!entity) {
    return 'outside a test'
  }
  if (entity.type === 'module') {
    return entity.moduleId
  }
  return `${entity.module.moduleId} > ${entity.fullName}`
}
