import { printLog, runMain, timeout } from '../lib/executionUtils.ts'
import { releaseVersion } from '../lib/browserSdkVersion.ts'
import { dispatchWorkflow, fetchWorkflowRun } from '../lib/gitUtils.ts'
import { getGithubPublishToken } from '../lib/secrets.ts'

const WORKFLOW = 'publish-npm.yml'
const POLL_INTERVAL = 15_000
const MAX_DURATION = 30 * 60_000

/**
 * Publish npm packages by dispatching the `publish-npm.yml` GitHub workflow on the release tag and
 * waiting for it to complete. Publishing from GitHub Actions allows npm trusted publishing (OIDC).
 * Usage:
 * node publish-npm-on-github.ts
 */
if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main())
}

export async function main(): Promise<void> {
  const ref = `v${releaseVersion}`
  using token = getGithubPublishToken()

  const { workflow_run_id: runId, html_url: runUrl } = await dispatchWorkflow(WORKFLOW, ref, token)
  printLog(`Dispatched ${WORKFLOW} on ${ref}: ${runUrl}`)

  const startTime = Date.now()
  let run = await fetchWorkflowRun(runId, token)
  while (run.status !== 'completed') {
    if (Date.now() - startTime > MAX_DURATION) {
      throw new Error(`Timed out waiting for ${WORKFLOW} to complete: ${runUrl}`)
    }
    await timeout(POLL_INTERVAL)
    run = await fetchWorkflowRun(runId, token)
  }

  if (run.conclusion !== 'success') {
    throw new Error(`${WORKFLOW} completed with conclusion "${run.conclusion}": ${runUrl}`)
  }
  printLog(`${WORKFLOW} succeeded: ${runUrl}`)
}
