import { printLog, runMain, timeout } from '../lib/executionUtils.ts'
import { callGitHubApi } from '../lib/gitUtils.ts'
import { getGithubPublishToken } from '../lib/secrets.ts'
import { releaseVersion } from '../lib/browserSdkVersion.ts'

const WORKFLOW_FILE = 'publish-npm.yml'
const POLL_INTERVAL_MS = 15_000
const MAX_WAIT_MS = 45 * 60_000

interface WorkflowDispatchResponse {
  workflow_run_id: number
  html_url: string
}

interface WorkflowRun {
  status: string
  conclusion: string | null
  html_url: string
}

/**
 * Dispatch the GitHub workflow publishing npm packages (with OIDC trusted publishing) on the
 * release tag, then wait for it to complete. Fails if the workflow run fails.
 */
if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main())
}

export async function main(): Promise<void> {
  const tag = `v${releaseVersion}`
  using token = getGithubPublishToken()

  printLog(`Dispatching ${WORKFLOW_FILE} on ${tag}`)
  const { workflow_run_id: runId, html_url: runUrl } = await callGitHubApi<WorkflowDispatchResponse>(
    'POST',
    `actions/workflows/${WORKFLOW_FILE}/dispatches`,
    token,
    { ref: tag, inputs: { version: tag }, return_run_details: true }
  )
  printLog(`Workflow run: ${runUrl}`)

  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    await timeout(POLL_INTERVAL_MS)
    const run = await callGitHubApi<WorkflowRun>('GET', `actions/runs/${runId}`, token)
    if (run.status === 'completed') {
      if (run.conclusion !== 'success') {
        throw new Error(`Workflow run ${run.html_url} ended with conclusion: ${run.conclusion}`)
      }
      printLog('Workflow run succeeded')
      return
    }
    printLog(`Workflow run status: ${run.status}`)
  }
  throw new Error(`Timed out waiting for workflow run ${runUrl}`)
}
