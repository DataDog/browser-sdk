import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeEach, before, after, describe, it, mock, type Mock } from 'node:test'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'
import { mockDatacenters, resetDatacenterCache } from '../lib/datacenter.ts'
import type { CommandDetail } from './lib/testHelpers.ts'
import { mockModule, mockCommandImplementation, mockFetchHandlingError, MOCK_DATACENTERS } from './lib/testHelpers.ts'

const currentBrowserSdkVersionMajor = browserSdkVersion.split('.')[0]

describe('deploy-prod-dc', () => {
  const commandMock = mock.fn()
  const checkTelemetryErrorsMock: Mock<(datacenters: string[], version: string) => Promise<void>> = mock.fn()
  const hasTelemetryCredentialsMock: Mock<(datacenters: string[]) => Promise<boolean>> = mock.fn()
  const fetchHandlingErrorMock = mock.fn()

  let commands: CommandDetail[]
  let checkTelemetryErrorsCalls: Array<{ version: string; datacenters: string[] }>
  let hasTelemetryCredentialsCalls: string[][]
  let mockTime: number
  const originalDateNow = Date.now

  before(async () => {
    mockFetchHandlingError(fetchHandlingErrorMock)
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
      fetchHandlingError: fetchHandlingErrorMock,
      timeout: (ms: number) => {
        mockTime += ms
        return Promise.resolve()
      },
    })
    await mockModule(path.resolve(import.meta.dirname, './lib/checkTelemetryErrors.ts'), {
      checkTelemetryErrors: checkTelemetryErrorsMock,
      hasTelemetryCredentials: hasTelemetryCredentialsMock,
    })
  })

  beforeEach(() => {
    mockDatacenters(MOCK_DATACENTERS)
    commands = mockCommandImplementation(commandMock)
    checkTelemetryErrorsCalls = []
    hasTelemetryCredentialsCalls = []
    checkTelemetryErrorsMock.mock.mockImplementation((datacenters: string[], version: string) => {
      checkTelemetryErrorsCalls.push({ version, datacenters })
      return Promise.resolve()
    })
    hasTelemetryCredentialsMock.mock.mockImplementation((datacenters: string[]) => {
      hasTelemetryCredentialsCalls.push(datacenters)
      return Promise.resolve(true)
    })

    // Mock time control
    mockTime = Date.UTC(2026, 0, 16, 12, 0, 0)
    Date.now = () => mockTime
  })

  after(() => {
    Date.now = originalDateNow
    resetDatacenterCache()
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

  it('should skip deployment when no private regions exist', async () => {
    mockDatacenters(MOCK_DATACENTERS.filter((dc) => dc.type !== 'private'))

    await runScript('./deploy-prod-dc.ts', 'v6', 'private-regions')

    assert.strictEqual(commands.length, 0)
  })

  it('should deploy gov datacenters to the root upload path and skip all telemetry error checks', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'gov', '--check-telemetry-errors')

    // gov datacenters should not be checked for telemetry errors
    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)
    // credentials should not be checked either, since gov skips telemetry entirely
    assert.strictEqual(hasTelemetryCredentialsCalls.length, 0)

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 root' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 root' },
    ])
  })

  it('should skip telemetry error checks when no datacenter has telemetry credentials', async () => {
    hasTelemetryCredentialsMock.mock.mockImplementation((datacenters: string[]) => {
      hasTelemetryCredentialsCalls.push(datacenters)
      return Promise.resolve(false)
    })

    await runScript('./deploy-prod-dc.ts', 'v6', 'us1', '--check-telemetry-errors')

    // credentials are checked once, but no telemetry error checks are performed
    assert.strictEqual(hasTelemetryCredentialsCalls.length, 1)
    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 us1' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 us1' },
    ])
  })
})

async function runScript(scriptPath: string, ...args: string[]): Promise<void> {
  const { main } = (await import(scriptPath)) as { main: (...args: string[]) => Promise<void> }

  return main(...args)
}
