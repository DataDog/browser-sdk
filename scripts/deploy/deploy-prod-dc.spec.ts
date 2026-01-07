import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeEach, before, describe, it, mock, type Mock } from 'node:test'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'
import type { CommandDetail } from './lib/testHelpers.ts'
import { mockModule, mockCommandImplementation } from './lib/testHelpers.ts'

const currentBrowserSdkVersionMajor = browserSdkVersion.split('.')[0]

describe('deploy-prod-dc', () => {
  const commandMock = mock.fn()
  const checkTelemetryErrorsMock: Mock<(datacenters: string[], version: string) => Promise<void>> = mock.fn()

  let commands: CommandDetail[]
  let checkTelemetryErrorsCalls: Array<{ version: string; datacenters: string[] }>

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
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

  it('should deploy a given datacenter with check monitors', async () => {
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

  it('should only check monitors before deploying if the upload path is root', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'root', '--check-telemetry-errors')

    // Should only call checkTelemetryErrors once (no gating for root)
    assert.strictEqual(checkTelemetryErrorsCalls.length, 1)
    assert.deepEqual(checkTelemetryErrorsCalls[0], {
      version: `${currentBrowserSdkVersionMajor}.*`,
      datacenters: ['root'],
    })

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 root' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 root' },
    ])
  })

  it('should deploy all minor datacenters', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'minor-dcs', '--no-check-telemetry-errors')

    // Should not call checkTelemetryErrors when --no-check-telemetry-errors is used
    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 us3,us5,ap1,ap2,prtest00' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 us3,us5,ap1,ap2,prtest00' },
    ])
  })
})

async function runScript(scriptPath: string, ...args: string[]): Promise<void> {
  const { main } = (await import(scriptPath)) as { main: (...args: string[]) => Promise<void> }

  return main(...args)
}
