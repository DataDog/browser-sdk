const assert = require('node:assert/strict')
const { beforeEach, before, describe, it, mock } = require('node:test')
const path = require('node:path')
const {
  mockModule,
  mockCommandImplementation,
  replaceChunkHashes,
  FAKE_AWS_ENV_CREDENTIALS,
  FAKE_CHUNK_HASH,
} = require('./lib/testHelpers.js')

void describe('deploy', () => {
  let commandMock = mock.fn()
  let fetchPRMock = mock.fn()
  let deploy
  const env = FAKE_AWS_ENV_CREDENTIALS

  let commands

  function getS3Commands() {
    return commands.filter(({ command }) => command.includes('aws s3 cp')).map(replaceChunkHashes)
  }

  function getCloudfrontCommands() {
    return commands
      .filter(({ command }) => command.includes('aws cloudfront create-invalidation'))
      .map(replaceChunkHashes)
  }

  before(async () => {
    await mockModule(path.resolve(__dirname, '../lib/command.js'), { command: commandMock })
    await mockModule(path.resolve(__dirname, '../lib/gitUtils.js'), { fetchPR: fetchPRMock })

    // This MUST be a dynamic import because that is the only way to ensure the
    // import starts after the mock has been set up.
    ;({ main: deploy } = await import('./deploy.js'))
  })

  beforeEach(() => {
    commands = mockCommandImplementation(commandMock)
  })

  void it('should deploy root packages', async () => {
    await deploy('prod', 'v6', ['root'])

    assert.deepEqual(getS3Commands(), [
      {
        // Logs bundle
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/logs/bundle/datadog-logs.js s3://browser-agent-artifacts-prod/datadog-logs-v6.js',
        env,
      },
      {
        // Profiler chunk
        command: `aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum/bundle/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js s3://browser-agent-artifacts-prod/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js`,
        env,
      },
      {
        // RUM chunks: We don't suffix chunk names as they are referenced by the main bundle. Renaming them would require updates via Webpack, adding unnecessary complexity for minimal value.
        command: `aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum/bundle/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js s3://browser-agent-artifacts-prod/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js`,
        env,
      },
      // RUM bundle
      {
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum/bundle/datadog-rum.js s3://browser-agent-artifacts-prod/datadog-rum-v6.js',
        env,
      },
      // RUM slim Profiler chunk
      {
        command: `aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum-slim/bundle/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js s3://browser-agent-artifacts-prod/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js`,
        env,
      },
      // RUM slim bundle
      {
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum-slim/bundle/datadog-rum-slim.js s3://browser-agent-artifacts-prod/datadog-rum-slim-v6.js',
        env,
      },
    ])

    assert.deepEqual(getCloudfrontCommands(), [
      {
        command: `aws cloudfront create-invalidation --distribution-id EGB08BYCT1DD9 --paths /datadog-logs-v6.js,/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js,/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js,/datadog-rum-v6.js,/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js,/datadog-rum-slim-v6.js`,
        env,
      },
    ])
  })

  void it('should deploy datacenter packages', async () => {
    await deploy('prod', 'v6', ['us1'])

    assert.deepEqual(getS3Commands(), [
      {
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/logs/bundle/datadog-logs.js s3://browser-agent-artifacts-prod/us1/v6/datadog-logs.js',
        env,
      },
      // RUM Profiler Chunk
      {
        command: `aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum/bundle/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js s3://browser-agent-artifacts-prod/us1/v6/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js`,
        env,
      },
      {
        command: `aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum/bundle/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js s3://browser-agent-artifacts-prod/us1/v6/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js`,
        env,
      },
      {
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum/bundle/datadog-rum.js s3://browser-agent-artifacts-prod/us1/v6/datadog-rum.js',
        env,
      },
      // RUM Slim Profiler Chunk
      {
        command: `aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum-slim/bundle/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js s3://browser-agent-artifacts-prod/us1/v6/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js`,
        env,
      },
      {
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum-slim/bundle/datadog-rum-slim.js s3://browser-agent-artifacts-prod/us1/v6/datadog-rum-slim.js',
        env,
      },
    ])
    assert.deepEqual(getCloudfrontCommands(), [
      {
        command: `aws cloudfront create-invalidation --distribution-id EGB08BYCT1DD9 --paths /us1/v6/datadog-logs.js,/us1/v6/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js,/us1/v6/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js,/us1/v6/datadog-rum.js,/us1/v6/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js,/us1/v6/datadog-rum-slim.js`,
        env,
      },
    ])
  })

  void it('should deploy staging packages', async () => {
    await deploy('staging', 'staging', ['root'])

    assert.deepEqual(getS3Commands(), [
      {
        command:
          'aws s3 cp --cache-control max-age=900, s-maxage=60 packages/logs/bundle/datadog-logs.js s3://browser-agent-artifacts-staging/datadog-logs-staging.js',
        env,
      },
      // RUM Profiler Chunk
      {
        command: `aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum/bundle/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js s3://browser-agent-artifacts-staging/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js`,
        env,
      },
      {
        command: `aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum/bundle/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js s3://browser-agent-artifacts-staging/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js`,
        env,
      },
      {
        command:
          'aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum/bundle/datadog-rum.js s3://browser-agent-artifacts-staging/datadog-rum-staging.js',
        env,
      },
      // RUM Slim Profiler Chunk
      {
        command: `aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum-slim/bundle/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js s3://browser-agent-artifacts-staging/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js`,
        env,
      },
      {
        command:
          'aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum-slim/bundle/datadog-rum-slim.js s3://browser-agent-artifacts-staging/datadog-rum-slim-staging.js',
        env,
      },
    ])

    assert.deepEqual(getCloudfrontCommands(), [
      {
        command: `aws cloudfront create-invalidation --distribution-id E2FP11ZSCFD3EU --paths /datadog-logs-staging.js,/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js,/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js,/datadog-rum-staging.js,/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js,/datadog-rum-slim-staging.js`,
        env,
      },
    ])
  })

  void it('should deploy PR packages', async () => {
    // mock the PR number fetch
    fetchPRMock.mock.mockImplementation(() => Promise.resolve({ ['number']: 123 }))

    await deploy('staging', 'pull-request', ['pull-request'])

    assert.deepEqual(getS3Commands(), [
      {
        command:
          'aws s3 cp --cache-control max-age=900, s-maxage=60 packages/logs/bundle/datadog-logs.js s3://browser-agent-artifacts-staging/pull-request/123/datadog-logs.js',
        env,
      },
      // RUM Profiler Chunk
      {
        command: `aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum/bundle/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js s3://browser-agent-artifacts-staging/pull-request/123/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js`,
        env,
      },
      {
        command: `aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum/bundle/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js s3://browser-agent-artifacts-staging/pull-request/123/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js`,
        env,
      },
      {
        command:
          'aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum/bundle/datadog-rum.js s3://browser-agent-artifacts-staging/pull-request/123/datadog-rum.js',
        env,
      },
      // RUM Slim Profiler Chunk
      {
        command: `aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum-slim/bundle/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js s3://browser-agent-artifacts-staging/pull-request/123/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum-slim.js`,
        env,
      },
      {
        command:
          'aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum-slim/bundle/datadog-rum-slim.js s3://browser-agent-artifacts-staging/pull-request/123/datadog-rum-slim.js',
        env,
      },
    ])

    assert.deepEqual(getCloudfrontCommands(), [
      {
        command: `aws cloudfront create-invalidation --distribution-id E2FP11ZSCFD3EU --paths /pull-request/123/datadog-logs.js,/pull-request/123/chunks/profiler-${FAKE_CHUNK_HASH}-datadog-rum.js,/pull-request/123/chunks/recorder-${FAKE_CHUNK_HASH}-datadog-rum.js,/pull-request/123/datadog-rum.js,/pull-request/123/chunks/profiler-FAKEHASHd7628536637b074ddc3b-datadog-rum-slim.js,/pull-request/123/datadog-rum-slim.js`,
        env,
      },
    ])
  })
})
