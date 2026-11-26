import assert from 'node:assert/strict'
import path from 'node:path'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import type { CommandDetail } from './lib/testHelpers.ts'
import { mockCommandImplementation, mockModule } from './lib/testHelpers.ts'

const ORG2_API_KEY = 'ORG2_API_KEY'
const ENV_ORG2_PROD = { DD_API_KEY: ORG2_API_KEY, DD_SITE: 'datadoghq.com' }
const STARTED_AT = '2026-11-26T08:00:00Z'
const COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567'
const FINISHED_AT = '2026-11-26T10:00:00.000Z'

describe('send-dora-deployment', () => {
  const commandMock = mock.fn<(...args: any[]) => any>()
  const getOrg2ApiKeyMock = mock.fn(() => ORG2_API_KEY)
  let commands: CommandDetail[]
  let main: () => void

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/secrets.ts'), {
      getOrg2ApiKey: getOrg2ApiKeyMock,
    })
    await mockModule(path.resolve(import.meta.dirname, '../lib/browserSdkVersion.ts'), {
      browserSdkVersion: '7.0.0',
    })
    ;({ main } = await import('./send-dora-deployment.ts'))
  })

  beforeEach(() => {
    commands = mockCommandImplementation(commandMock)
    mock.timers.enable({ apis: ['Date'], now: new Date(FINISHED_AT) })
    process.env.CI_PIPELINE_CREATED_AT = STARTED_AT
    process.env.CI_COMMIT_SHA = COMMIT_SHA
  })

  afterEach(() => {
    mock.timers.reset()
    commandMock.mock.resetCalls()
    getOrg2ApiKeyMock.mock.restore()
    delete process.env.CI_PIPELINE_CREATED_AT
    delete process.env.CI_COMMIT_SHA
  })

  function doraCommand(service: string): string {
    return `datadog-ci dora deployment --service ${service} --env prod --version 7.0.0 --team rum-browser --started-at ${STARTED_AT} --finished-at ${FINISHED_AT} --git-repository-url https://github.com/DataDog/browser-sdk --git-commit-sha ${COMMIT_SHA}`
  }

  it('should send a deployment for each service', () => {
    main()

    assert.deepEqual(commands, [
      { command: doraCommand('browser-rum-sdk'), env: ENV_ORG2_PROD },
      { command: doraCommand('browser-logs-sdk'), env: ENV_ORG2_PROD },
    ])
  })

  it('should not fail when a deployment cannot be sent', () => {
    const failingChain = {
      withEnvironment: () => failingChain,
      withLogs: () => failingChain,
      run: () => {
        throw new Error('intake error')
      },
    }
    commandMock.mock.mockImplementation(() => failingChain)

    assert.doesNotThrow(() => main())
    assert.equal(commandMock.mock.callCount(), 2)
  })

  it('should not fail when the API key cannot be retrieved', () => {
    getOrg2ApiKeyMock.mock.mockImplementation(() => {
      throw new Error('ssm error')
    })

    assert.doesNotThrow(() => main())
    assert.deepEqual(commands, [])
  })

  it('should skip the deployments without the CI environment variables', () => {
    delete process.env.CI_PIPELINE_CREATED_AT

    assert.doesNotThrow(() => main())
    assert.deepEqual(commands, [])
  })
})
