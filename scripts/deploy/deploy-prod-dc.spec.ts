import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeEach, before, describe, it, mock, type Mock } from 'node:test'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'
import type { CommandDetail } from './lib/testHelpers.ts'
import { mockModule, mockCommandImplementation, mockFetchHandlingError } from './lib/testHelpers.ts'

const currentBrowserSdkVersionMajor = browserSdkVersion.split('.')[0]

describe('deploy-prod-dc', () => {
  const commandMock = mock.fn()
  const checkTelemetryErrorsMock: Mock<(datacenters: string[], version: string) => Promise<void>> = mock.fn()
  const fetchHandlingErrorMock = mock.fn()

  let commands: CommandDetail[]
  let checkTelemetryErrorsCalls: Array<{ version: string; datacenters: string[] }>

  before(async () => {
    mockFetchHandlingError(fetchHandlingErrorMock)
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
      fetchHandlingError: fetchHandlingErrorMock,
      timeout: () => Promise.resolve(),
    })
    await mockModule(path.resolve(import.meta.dirname, './lib/checkTelemetryErrors.ts'), {
      checkTelemetryErrors: checkTelemetryErrorsMock,
    })
  })

  beforeEach(() => {
    commands = mockCommandImplementation(commandMock)
    checkTelemetryErrorsCalls = []
    checkTelemetryErrorsMock.mock.mockImplementation((datacenters: string[], version: string) => {
      checkTelemetryErrorsCalls.push({ version, datacenters })
      return Promise.resolve()
    })
  })

  it('should deploy a given datacenter', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'us1')

    // Should not call checkTelemetryErrors by default (no flag)
    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 us1' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 us1' },
    ])
  })

  it('should deploy a given datacenter with check telemetry errors', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'us1', '--check-telemetry-errors')

    // Should call checkTelemetryErrors 31 times: 1 initial + 30 during gating
    assert.strictEqual(checkTelemetryErrorsCalls.length, 31)
    assert.deepEqual(checkTelemetryErrorsCalls[0], {
      version: `${currentBrowserSdkVersionMajor}.*`,
      datacenters: ['us1'],
    }) // Initial check
    assert.deepEqual(checkTelemetryErrorsCalls[30], { version: browserSdkVersion, datacenters: ['us1'] }) // Last gating check

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 us1' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 us1' },
    ])
  })

  it('should deploy all minor datacenters', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'minor-dcs', '--no-check-telemetry-errors')

    // Should not call checkTelemetryErrors when --no-check-telemetry-errors is used
    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 ap1,ap2,us3,us5' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 ap1,ap2,us3,us5' },
    ])
  })

  it('should deploy all private regions', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'private-regions', '--no-check-telemetry-errors')

    // Should not call checkTelemetryErrors when --no-check-telemetry-errors is used
    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 prtest00,prtest01' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 prtest00,prtest01' },
    ])
  })

  it('should deploy gov datacenters to the root upload path and skip all telemetry error checks', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'gov', '--check-telemetry-errors')

    // gov datacenters should not be checked for telemetry errors
    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 root' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 root' },
    ])
  })
})

async function runScript(scriptPath: string, ...args: string[]): Promise<void> {
  const { main } = (await import(scriptPath)) as { main: (...args: string[]) => Promise<void> }

  return main(...args)
}
