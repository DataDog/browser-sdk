const assert = require('node:assert/strict')
const { beforeEach, before, describe, it, mock } = require('node:test')
const path = require('node:path')
const { mockModule, mockCommandImplementation, FAKE_AWS_ENV_CREDENTIALS } = require('./lib/testHelpers.js')

void describe('deploy', () => {
  let commandMock = mock.fn()
  let fetchPRMock = mock.fn()
  let deploy
  const env = FAKE_AWS_ENV_CREDENTIALS

  let commands

  function getS3Commands() {
    return commands.filter(({ command }) => command.includes('aws s3 cp'))
  }

  function getCloudfrontCommands() {
    return commands.filter(({ command }) => command.includes('aws cloudfront create-invalidation'))
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
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/logs/bundle/datadog-logs.js s3://browser-agent-artifacts-prod/datadog-logs-v6.js',
        env,
      },
      {
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum/bundle/datadog-rum.js s3://browser-agent-artifacts-prod/datadog-rum-v6.js',
        env,
      },
      {
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum-slim/bundle/datadog-rum-slim.js s3://browser-agent-artifacts-prod/datadog-rum-slim-v6.js',
        env,
      },
    ])

    assert.deepEqual(getCloudfrontCommands(), [
      {
        command:
          'aws cloudfront create-invalidation --distribution-id EGB08BYCT1DD9 --paths /datadog-logs-v6.js,/datadog-rum-v6.js,/datadog-rum-slim-v6.js',
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
      {
        command:
          'aws s3 cp --cache-control max-age=14400, s-maxage=60 packages/rum/bundle/datadog-rum.js s3://browser-agent-artifacts-prod/us1/v6/datadog-rum.js',
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
        command:
          'aws cloudfront create-invalidation --distribution-id EGB08BYCT1DD9 --paths /us1/v6/datadog-logs.js,/us1/v6/datadog-rum.js,/us1/v6/datadog-rum-slim.js',
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
      {
        command:
          'aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum/bundle/datadog-rum.js s3://browser-agent-artifacts-staging/datadog-rum-staging.js',
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
        command:
          'aws cloudfront create-invalidation --distribution-id E2FP11ZSCFD3EU --paths /datadog-logs-staging.js,/datadog-rum-staging.js,/datadog-rum-slim-staging.js',
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
      {
        command:
          'aws s3 cp --cache-control max-age=900, s-maxage=60 packages/rum/bundle/datadog-rum.js s3://browser-agent-artifacts-staging/pull-request/123/datadog-rum.js',
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
        command:
          'aws cloudfront create-invalidation --distribution-id E2FP11ZSCFD3EU --paths /pull-request/123/datadog-logs.js,/pull-request/123/datadog-rum.js,/pull-request/123/datadog-rum-slim.js',
        env,
      },
    ])
  })
})
