import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeEach, before, describe, it, mock } from 'node:test'
import type { CommandDetail } from './lib/testHelpers.ts'
import { mockModule, mockCommandImplementation } from './lib/testHelpers.ts'

// eslint-disable-next-line
describe.only('deploy-prod-dc', () => {
  const commandMock = mock.fn()

  let commands: CommandDetail[]

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
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

  it('should only check monitors before deploying if the upload path is root', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'root', '--check-monitors')

    assert.deepEqual(commands, [
      { command: 'node ./scripts/deploy/check-monitors.ts root' },
      { command: 'node ./scripts/deploy/deploy.ts prod v6 root' },
      { command: 'node ./scripts/deploy/upload-source-maps.ts v6 root' },
    ])
  })

  it('should deploy all minor datacenters', async () => {
    await runScript('./deploy-prod-dc.ts', 'v6', 'minor-dcs', '--no-check-monitors')

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
