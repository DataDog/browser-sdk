import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeEach, before, after, describe, it, mock, type Mock } from 'node:test'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'
import { mockDatacenters, resetDatacenterCache } from '../lib/datacenter.ts'
import type { CommandDetail } from './lib/testHelpers.ts'
import { mockModule, mockCommandImplementation, mockFetchHandlingError, MOCK_DATACENTERS } from './lib/testHelpers.ts'
import type { Cordon } from './lib/checkCordons.ts'

const currentBrowserSdkVersionMajor = browserSdkVersion.split('.')[0]

describe('deploy-prod-dc', () => {
  const commandMock = mock.fn()
  const checkTelemetryErrorsMock: Mock<(datacenters: string[], version: string) => Promise<void>> = mock.fn()
  const fetchHandlingErrorMock = mock.fn()
  const findCordonedDatacentersMock: Mock<(datacenters: string[]) => Promise<Map<string, Cordon[]>>> = mock.fn()
  const printWarningMock = mock.fn()

  let commands: CommandDetail[]
  let checkTelemetryErrorsCalls: Array<{ version: string; datacenters: string[] }>
  let mockTime: number
  const originalDateNow = Date.now

  before(async () => {
    mockFetchHandlingError(fetchHandlingErrorMock)
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
      fetchHandlingError: fetchHandlingErrorMock,
      printWarning: printWarningMock,
      timeout: (ms: number) => {
        mockTime += ms
        return Promise.resolve()
      },
    })
    await mockModule(path.resolve(import.meta.dirname, './lib/checkTelemetryErrors.ts'), {
      checkTelemetryErrors: checkTelemetryErrorsMock,
    })
    await mockModule(path.resolve(import.meta.dirname, './lib/checkCordons.ts'), {
      findCordonedDatacenters: findCordonedDatacentersMock,
    })
  })

  function mockCordonedDatacenters(...datacenters: string[]): void {
    findCordonedDatacentersMock.mock.mockImplementation(() =>
      Promise.resolve(new Map(datacenters.map((datacenter) => [datacenter, [cordonOf(datacenter)]])))
    )
  }

  beforeEach(() => {
    mockDatacenters(MOCK_DATACENTERS)
    commands = mockCommandImplementation(commandMock)
    checkTelemetryErrorsCalls = []
    findCordonedDatacentersMock.mock.resetCalls()
    printWarningMock.mock.resetCalls()
    mockCordonedDatacenters()
    checkTelemetryErrorsMock.mock.mockImplementation((datacenters: string[], version: string) => {
      checkTelemetryErrorsCalls.push({ version, datacenters })
      return Promise.resolve()
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

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 root' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 root' },
    ])
  })

  it('should check cordons on the target datacenters', async () => {
    const result = await runScript('./deploy-prod-dc.ts', 'v6', 'minor-dcs')

    assert.deepEqual(findCordonedDatacentersMock.mock.calls[0].arguments[0], ['ap1', 'ap2', 'us3', 'us5'])
    assert.deepEqual(result, { skippedDatacenters: [] })
  })

  it('should deploy the open datacenters and skip the cordoned ones', async () => {
    mockCordonedDatacenters('ap2')

    const result = await runScript('./deploy-prod-dc.ts', 'v6', 'minor-dcs', '--check-telemetry-errors')

    assert.deepEqual(result, { skippedDatacenters: ['ap2'] })
    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 ap1,us3,us5' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 ap1,us3,us5' },
    ])
    assert.ok(checkTelemetryErrorsCalls.length > 0)
    for (const call of checkTelemetryErrorsCalls) {
      assert.deepEqual(call.datacenters, ['ap1', 'us3', 'us5'])
    }
    assert.match(String(printWarningMock.mock.calls[0].arguments[0]), /Skipped cordoned datacenters: ap2/)
  })

  it('should not deploy when all target datacenters are cordoned', async () => {
    mockCordonedDatacenters('us1')

    const result = await runScript('./deploy-prod-dc.ts', 'v6', 'us1', '--check-telemetry-errors')

    assert.deepEqual(result, { skippedDatacenters: ['us1'] })
    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)
    assert.deepEqual(commands, [])
  })

  it('should not deploy when the cordons cannot be checked', async () => {
    findCordonedDatacentersMock.mock.mockImplementation(() =>
      Promise.reject(new Error('Failed to check cordons for us1.prod.dog'))
    )

    await assert.rejects(
      runScript('./deploy-prod-dc.ts', 'v6', 'us1', '--check-telemetry-errors'),
      /Failed to check cordons for us1\.prod\.dog/
    )

    assert.strictEqual(checkTelemetryErrorsCalls.length, 0)
    assert.deepEqual(commands, [])
  })

  it('should not check cordons when there is no datacenter to deploy', async () => {
    mockDatacenters(MOCK_DATACENTERS.filter((dc) => dc.type !== 'private'))

    await runScript('./deploy-prod-dc.ts', 'v6', 'private-regions')

    assert.strictEqual(findCordonedDatacentersMock.mock.callCount(), 0)
  })
})

function cordonOf(datacenter: string): Cordon {
  return { name: `cordon-${datacenter}`, resourceType: 'datacenter', resourceId: `${datacenter}.prod.dog` }
}

async function runScript(scriptPath: string, ...args: string[]): Promise<{ skippedDatacenters: string[] }> {
  const { main } = (await import(scriptPath)) as {
    main: (...args: string[]) => Promise<{ skippedDatacenters: string[] }>
  }

  return main(...args)
}
