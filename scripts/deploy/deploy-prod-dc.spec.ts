import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeEach, before, describe, it, mock, afterEach } from 'node:test'
import type { CommandDetail } from './lib/testHelpers.ts'
import { mockCommandImplementation, mockModule, mockFetchHandlingError } from './lib/testHelpers.ts'

describe('deploy-prod-dc', () => {
  const commandMock = mock.fn()
  const fetchHandlingErrorMock = mock.fn()
  let commands: CommandDetail[]

  before(async () => {
    mockFetchHandlingError(fetchHandlingErrorMock)
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
      fetchHandlingError: fetchHandlingErrorMock,
      timeout: () => Promise.resolve(),
    })
  })

  beforeEach(() => {
    commands = mockCommandImplementation(commandMock)
  })

  it('should deploy a given datacenter', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'us1')

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 us1' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 us1' },
    ])
  })

  it('should deploy a given datacenter with check monitors', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'us1', '--check-monitors')

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/check-monitors.ts us1' },
      { command: 'node ./scripts/deploy/deploy.ts prod v6 us1' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 us1' },
      // 1 monitor check per minute for 30 minutes
      ...Array.from({ length: 30 }, () => ({ command: 'node ./scripts/deploy/check-monitors.ts us1' })),
    ])
  })

  it('should deploy all minor datacenters', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'minor-dcs', '--no-check-monitors')

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 ap1,ap2,us3,us5' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 ap1,ap2,us3,us5' },
    ])
  })

  it('should deploy all private regions', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'private-regions', '--no-check-monitors')

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/deploy.ts prod v6 prtest00,prtest01' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 prtest00,prtest01' },
    ])
  })

  it('should deploy gov datacenters to the root upload path', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'gov', '--no-check-monitors')

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
