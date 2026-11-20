import assert from 'node:assert/strict'
import path from 'node:path'
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test'
import { releaseVersion } from '../lib/browserSdkVersion.ts'
import type { WorkflowRun, WorkflowRunRef } from '../lib/gitUtils.ts'
import { mockModule } from './lib/testHelpers.ts'

const TAG = `v${releaseVersion}`
const RUN_ID = 4242
const RUN_URL = 'https://github.com/DataDog/browser-sdk/actions/runs/4242'
const POLL_INTERVAL_MS = 15_000

describe('dispatch-publish-npm', () => {
  const dispatchWorkflowMock = mock.fn<(...args: any[]) => Promise<WorkflowRunRef>>()
  const getWorkflowRunMock = mock.fn<(runId: number, token: unknown) => Promise<WorkflowRun>>()
  const getGithubPublishTokenMock = mock.fn<() => { value: string; [Symbol.dispose]: () => void }>()
  const disposeTokenMock = mock.fn<() => void>()

  let main: (args?: string[]) => Promise<void>
  let waitedMs: number
  let originalCommitTag: string | undefined

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/gitUtils.ts'), {
      dispatchWorkflow: dispatchWorkflowMock,
      getWorkflowRun: getWorkflowRunMock,
    })
    await mockModule(path.resolve(import.meta.dirname, '../lib/secrets.ts'), {
      getGithubPublishToken: getGithubPublishTokenMock,
    })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
      timeout: (ms: number) => {
        waitedMs += ms
        return Promise.resolve()
      },
    })

    const dispatchModule: { main: (args?: string[]) => Promise<void> } = await import('./dispatch-publish-npm.ts')
    ;({ main } = dispatchModule)
  })

  beforeEach(() => {
    // Also set in tag pipelines, so always set it explicitly
    originalCommitTag = process.env.CI_COMMIT_TAG
    process.env.CI_COMMIT_TAG = TAG

    waitedMs = 0
    dispatchWorkflowMock.mock.resetCalls()
    getWorkflowRunMock.mock.resetCalls()
    getGithubPublishTokenMock.mock.resetCalls()
    disposeTokenMock.mock.resetCalls()

    dispatchWorkflowMock.mock.mockImplementation(() => Promise.resolve({ workflow_run_id: RUN_ID, html_url: RUN_URL }))
    getGithubPublishTokenMock.mock.mockImplementation(() => ({
      value: 'fake-github-token',
      [Symbol.dispose]: disposeTokenMock,
    }))
    mockRunStatuses(completed('success'))
  })

  afterEach(() => {
    if (originalCommitTag === undefined) {
      delete process.env.CI_COMMIT_TAG
    } else {
      process.env.CI_COMMIT_TAG = originalCommitTag
    }
  })

  function mockRunStatuses(...statuses: Array<WorkflowRun | Error>) {
    let index = 0
    getWorkflowRunMock.mock.mockImplementation(() => {
      const status = statuses[Math.min(index++, statuses.length - 1)]
      return status instanceof Error ? Promise.reject(status) : Promise.resolve(status)
    })
  }

  describe('dispatch', () => {
    it('dispatches publish-npm.yml on the release tag, with the version as input', async () => {
      await main([])

      assert.equal(dispatchWorkflowMock.mock.callCount(), 1)
      const [workflowFile, params, token] = dispatchWorkflowMock.mock.calls[0].arguments
      assert.equal(workflowFile, 'publish-npm.yml')
      assert.deepEqual(params, { ref: TAG, inputs: { version: releaseVersion, 'dry-run': 'false' } })
      assert.equal(token.value, 'fake-github-token')
    })

    it('sets the dry-run input with --dry-run', async () => {
      await main(['--dry-run'])

      assert.equal(dispatchWorkflowMock.mock.calls[0].arguments[1].inputs['dry-run'], 'true')
    })

    it('fails before dispatching, and before getting a token, when the tag does not match the version', async () => {
      process.env.CI_COMMIT_TAG = 'v0.0.0'

      await assert.rejects(main([]), /does not match the package\.json version/)

      assert.equal(getGithubPublishTokenMock.mock.callCount(), 0)
      assert.equal(dispatchWorkflowMock.mock.callCount(), 0)
    })

    it('fails when not running on a tag', async () => {
      delete process.env.CI_COMMIT_TAG

      await assert.rejects(main([]), /does not match the package\.json version/)

      assert.equal(dispatchWorkflowMock.mock.callCount(), 0)
    })

    it('fails with the GitHub error when the dispatch is rejected', async () => {
      const dispatchError = new Error('Failed to call GitHub API: POST actions/workflows/publish-npm.yml/dispatches')
      dispatchWorkflowMock.mock.mockImplementation(() => Promise.reject(dispatchError))

      await assert.rejects(main([]), dispatchError)

      assert.equal(getWorkflowRunMock.mock.callCount(), 0)
      assert.equal(disposeTokenMock.mock.callCount(), 1)
    })
  })

  describe('waiting for the run', () => {
    it('polls the dispatched run until it succeeds', async () => {
      mockRunStatuses(
        { status: 'queued', conclusion: null, html_url: RUN_URL },
        { status: 'in_progress', conclusion: null, html_url: RUN_URL },
        { status: 'in_progress', conclusion: null, html_url: RUN_URL },
        completed('success')
      )

      await main([])

      assert.equal(getWorkflowRunMock.mock.callCount(), 4)
      assert.ok(getWorkflowRunMock.mock.calls.every((call) => call.arguments[0] === RUN_ID))
      assert.equal(waitedMs, 4 * POLL_INTERVAL_MS)
    })

    for (const conclusion of ['failure', 'cancelled']) {
      it(`fails with the run URL when the run is ${conclusion}`, async () => {
        mockRunStatuses({ status: 'in_progress', conclusion: null, html_url: RUN_URL }, completed(conclusion))

        await assert.rejects(main([]), (error: Error) => {
          assert.ok(error.message.includes(conclusion))
          assert.ok(error.message.includes(RUN_URL))
          assert.match(error.message, /Retrying step-6 is safe/)
          return true
        })
      })
    }

    it('fails with the run URL when the run never completes', async () => {
      mockRunStatuses({ status: 'in_progress', conclusion: null, html_url: RUN_URL })

      await assert.rejects(main([]), (error: Error) => {
        assert.match(error.message, /Timed out after 40 minutes/)
        assert.ok(error.message.includes(RUN_URL))
        return true
      })

      assert.equal(waitedMs, 40 * 60_000)
    })

    it('tolerates up to 3 transient polling errors in a row', async () => {
      const transientError = new Error('network down')
      mockRunStatuses(transientError, transientError, transientError, completed('success'))

      await main([])

      assert.equal(getWorkflowRunMock.mock.callCount(), 4)
    })

    it('resets the transient error count after a successful poll', async () => {
      const transientError = new Error('network down')
      const inProgress: WorkflowRun = { status: 'in_progress', conclusion: null, html_url: RUN_URL }
      mockRunStatuses(
        transientError,
        transientError,
        inProgress,
        transientError,
        transientError,
        transientError,
        completed('success')
      )

      await main([])

      assert.equal(getWorkflowRunMock.mock.callCount(), 7)
    })

    it('fails with the run URL and the cause after 4 polling errors in a row', async () => {
      const transientError = new Error('network down')
      mockRunStatuses(transientError)

      await assert.rejects(main([]), (error: Error) => {
        assert.ok(error.message.includes(RUN_URL))
        assert.equal(error.cause, transientError)
        return true
      })

      assert.equal(getWorkflowRunMock.mock.callCount(), 4)
    })
  })

  describe('token', () => {
    it('is revoked once, and only after the wait, when the run succeeds', async () => {
      mockRunStatuses({ status: 'in_progress', conclusion: null, html_url: RUN_URL }, completed('success'))
      const revokedAfterPolls: number[] = []
      disposeTokenMock.mock.mockImplementation(() => {
        revokedAfterPolls.push(getWorkflowRunMock.mock.callCount())
      })

      await main([])

      assert.deepEqual(revokedAfterPolls, [2])
    })

    it('is revoked when the run fails', async () => {
      mockRunStatuses(completed('failure'))

      await assert.rejects(main([]))

      assert.equal(disposeTokenMock.mock.callCount(), 1)
    })

    it('is revoked when the wait times out', async () => {
      mockRunStatuses({ status: 'queued', conclusion: null, html_url: RUN_URL })

      await assert.rejects(main([]))

      assert.equal(disposeTokenMock.mock.callCount(), 1)
    })
  })
})

function completed(conclusion: string): WorkflowRun {
  return { status: 'completed', conclusion, html_url: RUN_URL }
}
