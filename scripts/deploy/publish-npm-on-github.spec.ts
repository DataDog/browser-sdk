import assert from 'node:assert/strict'
import path from 'node:path'
import { before, beforeEach, describe, it, mock } from 'node:test'
import type { GitHubWorkflowRun } from '../lib/gitUtils.ts'
import { releaseVersion } from '../lib/browserSdkVersion.ts'
import { mockModule } from './lib/testHelpers.ts'

const RUN_ID = 42
const RUN_URL = 'https://github.com/DataDog/browser-sdk/actions/runs/42'

describe('publish-npm-on-github', () => {
  const dispatchWorkflowMock = mock.fn<(workflow: string, ref: string, token: unknown) => Promise<unknown>>()
  const fetchWorkflowRunMock = mock.fn<(runId: number, token: unknown) => Promise<GitHubWorkflowRun>>()
  const timeoutMock = mock.fn<(ms: number) => Promise<void>>()
  const revokeMock = mock.fn()

  let main: () => Promise<void>

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/gitUtils.ts'), {
      dispatchWorkflow: dispatchWorkflowMock,
      fetchWorkflowRun: fetchWorkflowRunMock,
    })
    await mockModule(path.resolve(import.meta.dirname, '../lib/secrets.ts'), {
      getGithubPublishToken: () => ({ value: 'fake-token', [Symbol.dispose]: revokeMock }),
    })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
      printLog: () => undefined,
      runMain: () => undefined,
      timeout: timeoutMock,
    })
    ;({ main } = await import('./publish-npm-on-github.ts'))
  })

  beforeEach(() => {
    dispatchWorkflowMock.mock.resetCalls()
    fetchWorkflowRunMock.mock.resetCalls()
    timeoutMock.mock.resetCalls()
    revokeMock.mock.resetCalls()
    dispatchWorkflowMock.mock.mockImplementation(() => Promise.resolve({ workflow_run_id: RUN_ID, html_url: RUN_URL }))
    timeoutMock.mock.mockImplementation(() => Promise.resolve())
  })

  function mockRunStatuses(...runs: Array<Omit<GitHubWorkflowRun, 'html_url'>>) {
    let index = 0
    fetchWorkflowRunMock.mock.mockImplementation(() =>
      Promise.resolve({ ...runs[Math.min(index++, runs.length - 1)], html_url: RUN_URL })
    )
  }

  it('should dispatch publish-npm.yml on the release tag', async () => {
    mockRunStatuses({ status: 'completed', conclusion: 'success' })

    await main()

    assert.deepEqual(dispatchWorkflowMock.mock.calls[0].arguments.slice(0, 2), [
      'publish-npm.yml',
      `v${releaseVersion}`,
    ])
    assert.equal(revokeMock.mock.callCount(), 1)
  })

  it('should wait for the run to complete', async () => {
    mockRunStatuses(
      { status: 'queued', conclusion: null },
      { status: 'in_progress', conclusion: null },
      { status: 'completed', conclusion: 'success' }
    )

    await main()

    assert.equal(fetchWorkflowRunMock.mock.callCount(), 3)
    assert.equal(fetchWorkflowRunMock.mock.calls[0].arguments[0], RUN_ID)
    assert.equal(timeoutMock.mock.callCount(), 2)
  })

  for (const conclusion of ['failure', 'cancelled']) {
    it(`should fail with the run URL when the run conclusion is ${conclusion}`, async () => {
      mockRunStatuses({ status: 'completed', conclusion })

      await assert.rejects(main(), (error: Error) => {
        assert.match(error.message, new RegExp(conclusion))
        assert.ok(error.message.includes(RUN_URL))
        return true
      })
    })
  }

  it('should fail with the run URL when the run does not complete in time', async () => {
    mockRunStatuses({ status: 'in_progress', conclusion: null })
    const now = Date.now()
    mock.method(Date, 'now', () => now + timeoutMock.mock.callCount() * 60 * 60_000)

    try {
      await assert.rejects(main(), (error: Error) => {
        assert.match(error.message, /Timed out/)
        assert.ok(error.message.includes(RUN_URL))
        return true
      })
    } finally {
      mock.restoreAll()
    }
  })
})
