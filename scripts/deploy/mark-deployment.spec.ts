import assert from 'node:assert/strict'
import path from 'node:path'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import type { CommandDetail } from './lib/testHelpers.ts'
import { mockCommandImplementation, mockModule } from './lib/testHelpers.ts'

const ORG2_API_KEY = 'ORG2_API_KEY'
// The command mock renders array arguments joined with commas
const PACKAGE_TAGS =
  '--tags,package:browser-logs,--tags,package:browser-rum,--tags,package:browser-rum-slim,--tags,package:browser-debugger,--tags,package:browser-rum-shopify,--tags,package:browser-early-collection'

describe('mark-deployment', () => {
  const commandMock = mock.fn()
  let commands: CommandDetail[]
  let main: (...args: string[]) => void

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/secrets.ts'), {
      getOrg2ApiKey: () => ORG2_API_KEY,
    })
    await mockModule(path.resolve(import.meta.dirname, '../lib/buildEnv.ts'), {
      getBuildEnvSdkVersion: () => '7.0.0',
    })
    ;({ main } = await import('./mark-deployment.ts'))
  })

  beforeEach(() => {
    commands = mockCommandImplementation(commandMock)
  })

  afterEach(() => {
    commandMock.mock.resetCalls()
  })

  it('should mark a canary deployment', () => {
    main('--env', 'canary')

    assert.deepEqual(commands, [
      {
        command: `datadog-ci deployment mark --no-fail --service browser-rum-sdk --env canary --revision 7.0.0 --tags,team:rum-browser,${PACKAGE_TAGS}`,
        env: { DD_API_KEY: ORG2_API_KEY, DD_SITE: 'datadoghq.com', DD_BETA_COMMANDS_ENABLED: '1' },
      },
    ])
  })

  it('should add a tag for each datacenter', () => {
    main('--env', 'prod', '--datacenter', 'ap1', '--datacenter', 'us3')

    assert.equal(
      commands[0].command,
      `datadog-ci deployment mark --no-fail --service browser-rum-sdk --env prod --revision 7.0.0 --tags,team:rum-browser,--tags,datacenter:ap1,--tags,datacenter:us3,${PACKAGE_TAGS}`
    )
  })

  it('should require an env', () => {
    assert.throws(() => main(), /--env argument is required/)
    assert.deepEqual(commands, [])
  })
})
