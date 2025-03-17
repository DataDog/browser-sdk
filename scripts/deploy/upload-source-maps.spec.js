const assert = require('node:assert/strict')
const path = require('node:path')
const { beforeEach, before, describe, it, mock } = require('node:test')
const { siteByDatacenter } = require('../lib/datadogSites')
const { mockModule, mockCommandImplementation, replaceChunkHashes } = require('./lib/testHelpers.js')

const FAKE_API_KEY = 'FAKE_API_KEY'
const ENV_STAGING = {
  DATADOG_API_KEY: FAKE_API_KEY,
  DATADOG_SITE: 'datad0g.com',
}
const ENV_PROD = {
  DATADOG_API_KEY: FAKE_API_KEY,
  DATADOG_SITE: 'datadoghq.com',
}
void describe('upload-source-maps', () => {
  let commandMock = mock.fn()
  let commands

  let uploadSourceMaps
  function getSourceMapCommands() {
    return commands.filter(({ command }) => command.includes('datadog-ci sourcemaps'))
  }

  function getFileRenamingCommands() {
    return commands.filter(({ command }) => command.includes('mv')).map(replaceChunkHashes)
  }

  before(async () => {
    await mockModule(path.resolve(__dirname, '../lib/command.js'), { command: commandMock })
    await mockModule(path.resolve(__dirname, '../lib/secrets.js'), { getTelemetryOrgApiKey: () => FAKE_API_KEY })

    // This MUST be a dynamic import because that is the only way to ensure the
    // import starts after the mock has been set up.
    ;({ main: uploadSourceMaps } = await import('./upload-source-maps.js'))
  })

  beforeEach(() => {
    commands = mockCommandImplementation(commandMock)
  })

  function forEachDatacenter(callback) {
    for (const site of Object.values(siteByDatacenter)) {
      callback(site)
    }
  }

  void it('should upload root packages source maps', async () => {
    await uploadSourceMaps('v6', ['root'])

    forEachDatacenter((site) => {
      const commandsByDatacenter = commands.filter(({ env }) => env?.DATADOG_SITE === site)
      const env = { DATADOG_API_KEY: FAKE_API_KEY, DATADOG_SITE: site }

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
      assert.deepEqual(commandsByDatacenter, [
        {
          command:
            'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
        {
          command:
            'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
          env,
        },
      ])
    })
  })

  void it('should upload datacenter packages source maps', async () => {
    await uploadSourceMaps('v6', ['us1'])

    assert.deepEqual(commands, [
      {
        command:
          'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix /us1/v6 --project-path @flashcatcloud/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix /us1/v6 --project-path @flashcatcloud/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix /us1/v6 --project-path @flashcatcloud/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
    ])
  })

  void it('should upload staging packages source maps', async () => {
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
    assert.deepEqual(getSourceMapCommands(), [
      {
        command:
          'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_STAGING,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_STAGING,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_STAGING,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
    ])
  })

  void it('should upload canary packages source maps', async () => {
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
    assert.deepEqual(getSourceMapCommands(), [
      {
        command:
          'datadog-ci sourcemaps upload packages/logs/bundle --service browser-logs-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-logs/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/rum/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-rum/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
      {
        command:
          'datadog-ci sourcemaps upload packages/rum-slim/bundle --service browser-rum-sdk --release-version dev --minified-path-prefix / --project-path @flashcatcloud/browser-rum-slim/ --repository-url https://www.github.com/datadog/browser-sdk',
        env: ENV_PROD,
      },
    ])
  })
})
