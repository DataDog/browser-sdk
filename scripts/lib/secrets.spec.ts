import assert from 'node:assert/strict'
import path from 'node:path'
import { afterEach, before, describe, it, mock } from 'node:test'
import { mockModule } from '../deploy/lib/testHelpers.ts'

describe('secrets', () => {
  let getTelemetryOrgApiKey: (site: string) => string | undefined
  const commandMock = mock.fn<(...args: any[]) => any>()

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, './command.ts'), { command: commandMock })
    ;({ getTelemetryOrgApiKey } = await import('./secrets.ts'))
  })

  afterEach(() => {
    commandMock.mock.resetCalls()
  })

  function mockCommandRun(run: () => string): void {
    commandMock.mock.mockImplementation(() => {
      const chain = {
        withInput: () => chain,
        withEnvironment: () => chain,
        withCurrentWorkingDirectory: () => chain,
        withLogs: () => chain,
        run,
      }
      return chain
    })
  }

  it('returns the secret value when the parameter exists', () => {
    mockCommandRun(() => 'a-secret-value\n')

    assert.strictEqual(getTelemetryOrgApiKey('datadoghq.com'), 'a-secret-value')
  })

  it('returns undefined when the parameter is not found', () => {
    mockCommandRun(() => {
      throw new Error(
        'Command failed with exit status 255: aws ssm get-parameter\n---- stderr: ----\n' +
          'aws: [ERROR]: An error occurred (ParameterNotFound) when calling the GetParameter operation:\n----'
      )
    })

    assert.strictEqual(getTelemetryOrgApiKey('datadoghq.com'), undefined)
  })

  it('rethrows errors that are not ParameterNotFound', () => {
    mockCommandRun(() => {
      throw new Error(
        'Command failed with exit status 255: aws ssm get-parameter\n---- stderr: ----\nNetwork error\n----'
      )
    })

    assert.throws(() => getTelemetryOrgApiKey('datadoghq.com'), /Network error/)
  })
})
