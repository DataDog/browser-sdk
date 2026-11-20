import { parseArgs } from 'node:util'
import { printLog, printWarning, runMain, timeout } from '../lib/executionUtils.ts'
import { releaseVersion } from '../lib/browserSdkVersion.ts'
import { dispatchWorkflow, getWorkflowRun } from '../lib/gitUtils.ts'
import { getGithubPublishToken } from '../lib/secrets.ts'

const WORKFLOW_FILE = 'publish-npm.yml'
const POLL_INTERVAL_MS = 15_000
// Longer than the 30 min job timeout of the workflow (plus queueing behind another run), and
// shorter than the one-hour lifetime of the GitHub token.
const MAX_WAIT_MS = 40 * 60_000
const MAX_CONSECUTIVE_POLL_ERRORS = 3

const RETRY_HINT = 'Retrying step-6 is safe: versions already on npm are skipped.'

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main())
}

/**
 * Publishing to npm runs in the `publish-npm.yml` GitHub workflow, because npm trusted publishing
 * only works from a supported CI provider. This script dispatches it on the release tag, then
 * waits for the run and fails if it fails.
 *
 * Retrying is safe: the workflow skips versions that are already on npm.
 */
export async function main(args = process.argv.slice(2)): Promise<void> {
  const {
    values: { 'dry-run': dryRun },
  } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean', default: false },
    },
  })

  const tag = `v${releaseVersion}`
  if (process.env.CI_COMMIT_TAG !== tag) {
    throw new Error(
      `The tag (CI_COMMIT_TAG=${process.env.CI_COMMIT_TAG ?? ''}) does not match the package.json version (${tag}).`
    )
  }

  // Held for the dispatch and the wait, it is revoked when the function exits
  using token = getGithubPublishToken()

  printLog(`Dispatching ${WORKFLOW_FILE} on ${tag}${dryRun ? ' (dry run)' : ''}`)
  const { workflow_run_id: runId, html_url: runUrl } = await dispatchWorkflow(
    WORKFLOW_FILE,
    { ref: tag, inputs: { version: releaseVersion, 'dry-run': String(dryRun) } },
    token
  )
  printLog(`Workflow run: ${runUrl}`)

  let elapsed = 0
  let lastStatus: string | undefined
  let consecutiveErrors = 0
  while (elapsed < MAX_WAIT_MS) {
    await timeout(POLL_INTERVAL_MS)
    elapsed += POLL_INTERVAL_MS

    let run
    try {
      run = await getWorkflowRun(runId, token)
      consecutiveErrors = 0
    } catch (error) {
      consecutiveErrors += 1
      if (consecutiveErrors > MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(`Failed to get the status of the workflow run ${runUrl}. It may still be running.`, {
          cause: error as Error,
        })
      }
      printWarning(`Failed to get the workflow run status (${consecutiveErrors}), retrying`)
      continue
    }

    if (run.status !== lastStatus) {
      lastStatus = run.status
      printLog(`Workflow run status: ${run.status}`)
    }

    if (run.status === 'completed') {
      if (run.conclusion !== 'success') {
        throw new Error(`Workflow run ${run.conclusion ?? 'unknown conclusion'}: ${runUrl}\n${RETRY_HINT}`)
      }
      printLog('Workflow run succeeded')
      return
    }
  }

  throw new Error(
    `Timed out after ${MAX_WAIT_MS / 60_000} minutes waiting for the workflow run ${runUrl}. ` +
      `It may still finish. ${RETRY_HINT}`
  )
}
