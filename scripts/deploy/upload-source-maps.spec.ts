import assert from 'node:assert/strict'
import path from 'node:path'
import { beforeEach, before, describe, it, mock } from 'node:test'
import { siteByDatacenter } from '../lib/datadogSites.ts'
import { mockModule, mockCommandImplementation, replaceChunkHashes } from './lib/testHelpers.ts'

const FAKE_ORG2_API_KEY = 'FAKE_ORG2_API_KEY'
const FAKE_TELEMETRY_API_KEY = 'FAKE_TELEMETRY_API_KEY'

interface CommandDetail {
  command: string
  env?: Record<string, string>
}

describe('upload-source-maps', () => {
  const commandMock = mock.fn()
  let commands: CommandDetail[]

  let uploadSourceMaps: (version: string, uploadPathTypes: string[]) => Promise<void>

  function getSourceMapCommands(env: Record<string, string>): CommandDetail[] {
    return commands
      .filter(({ command }) => command.includes('datadog-ci sourcemaps'))
      .filter(
        ({ env: envCommand }) =>
          envCommand!.DATADOG_SITE === env.DATADOG_SITE && envCommand!.DATADOG_API_KEY === env.DATADOG_API_KEY
      )
  }

  function getFileRenamingCommands(): CommandDetail[] {
    return commands.filter(({ command }) => command.includes('mv')).map(replaceChunkHashes)
  }

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/secrets.ts'), {
      getTelemetryOrgApiKey: () => FAKE_TELEMETRY_API_KEY,
      getOrg2ApiKey: () => FAKE_ORG2_API_KEY,
    })

    // This MUST be a dynamic import because that is the only way to ensure the
    // import starts after the mock has been set up.
    const uploadModule = await import('./upload-source-maps.ts')
    uploadSourceMaps = uploadModule.main
  })

  beforeEach(() => {
    commands = mockCommandImplementation(commandMock)
  })

  it('should upload root packages source maps', async () => {
    await uploadSourceMaps('v6', ['root'])

    // rename the files with the version suffix
    assert.deepEqual(getFileRenamingCommands(), [
      {
        command: 'mv packages/logs/bundle/datadog-logs.js packages/logs/bundle/datadog-logs-v6.js',
      },
      {
        command: 'mv packages/logs/bundle/datadog-logs.js.map packages/logs/bundle/datadog-logs-v6.js.map',
      },
      {
        command: 'mv packages/rum/bundle/datadog-rum.js packages/rum/bundle/datadog-rum-v6.js',
      },
      {
        command: 'mv packages/rum/bundle/datadog-rum.js.map packages/rum/bundle/datadog-rum-v6.js.map',
      },
      {
        command: 'mv packages/rum-slim/bundle/datadog-rum-slim.js packages/rum-slim/bundle/datadog-rum-slim-v6.js',
      },
      {
        command:
          'mv packages/rum-slim/bundle/datadog-rum-slim.js.map packages/rum-slim/bundle/datadog-rum-slim-v6.js.map',
      },
    ])

    // upload the source maps
    ;[
      { DATADOG_SITE: siteByDatacenter.us1, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.eu1, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.us3, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.us5, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.ap1, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.ap2, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.us1, DATADOG_API_KEY: FAKE_ORG2_API_KEY },
    ].forEach((env) => {
      assert.deepEqual(getSourceMapCommands(env), [
        {
          command:
            'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
      ])
    })
  })

  it('should upload datacenter packages source maps', async () => {
    await uploadSourceMaps('v6', ['us1'])

    // upload the source maps
    ;[
      { DATADOG_SITE: siteByDatacenter.us1, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.us1, DATADOG_API_KEY: FAKE_ORG2_API_KEY },
    ].forEach((env) => {
      assert.deepEqual(getSourceMapCommands(env), [
        {
          command:
            'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix /us1/v6 --project-path @datadog/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix /us1/v6 --project-path @datadog/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix /us1/v6 --project-path @datadog/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
      ])
    })
  })

  it('should upload staging packages source maps', async () => {
    await uploadSourceMaps('staging', ['root'])

    // rename the files with the version suffix
    assert.deepEqual(getFileRenamingCommands(), [
      {
        command: 'mv packages/logs/bundle/datadog-logs.js packages/logs/bundle/datadog-logs-staging.js',
      },
      {
        command: 'mv packages/logs/bundle/datadog-logs.js.map packages/logs/bundle/datadog-logs-staging.js.map',
      },
      {
        command: 'mv packages/rum/bundle/datadog-rum.js packages/rum/bundle/datadog-rum-staging.js',
      },
      {
        command: 'mv packages/rum/bundle/datadog-rum.js.map packages/rum/bundle/datadog-rum-staging.js.map',
      },
      {
        command: 'mv packages/rum-slim/bundle/datadog-rum-slim.js packages/rum-slim/bundle/datadog-rum-slim-staging.js',
      },
      {
        command:
          'mv packages/rum-slim/bundle/datadog-rum-slim.js.map packages/rum-slim/bundle/datadog-rum-slim-staging.js.map',
      },
    ])

    // upload the source maps
    ;[
      { DATADOG_SITE: 'datad0g.com', DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.us1, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.us1, DATADOG_API_KEY: FAKE_ORG2_API_KEY },
    ].forEach((env) => {
      assert.deepEqual(getSourceMapCommands(env), [
        {
          command:
            'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
      ])
    })
  })

  it('should upload canary packages source maps', async () => {
    await uploadSourceMaps('canary', ['root'])

    // rename the files with the version suffix
    assert.deepEqual(getFileRenamingCommands(), [
      {
        command: 'mv packages/logs/bundle/datadog-logs.js packages/logs/bundle/datadog-logs-canary.js',
      },
      {
        command: 'mv packages/logs/bundle/datadog-logs.js.map packages/logs/bundle/datadog-logs-canary.js.map',
      },
      {
        command: 'mv packages/rum/bundle/datadog-rum.js packages/rum/bundle/datadog-rum-canary.js',
      },
      {
        command: 'mv packages/rum/bundle/datadog-rum.js.map packages/rum/bundle/datadog-rum-canary.js.map',
      },
      {
        command: 'mv packages/rum-slim/bundle/datadog-rum-slim.js packages/rum-slim/bundle/datadog-rum-slim-canary.js',
      },
      {
        command:
          'mv packages/rum-slim/bundle/datadog-rum-slim.js.map packages/rum-slim/bundle/datadog-rum-slim-canary.js.map',
      },
    ])

    // upload the source maps
    ;[
      { DATADOG_SITE: siteByDatacenter.us1, DATADOG_API_KEY: FAKE_TELEMETRY_API_KEY },
      { DATADOG_SITE: siteByDatacenter.us1, DATADOG_API_KEY: FAKE_ORG2_API_KEY },
    ].forEach((env) => {
      assert.deepEqual(getSourceMapCommands(env), [
        {
          command:
            'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @datadog/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
      ])
    })
  })
})
