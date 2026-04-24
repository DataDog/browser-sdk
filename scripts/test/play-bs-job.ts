import { parseArgs } from 'node:util'
import { command } from '../lib/command.ts'
import { printLog, runMain, fetchHandlingError } from '../lib/executionUtils.ts'
import { fetchPR, LOCAL_BRANCH } from '../lib/gitUtils.ts'

const BTI_CI_API_TOKEN_URL = 'https://bti-ci-api.us1.ddbuild.io/internal/ci/gitlab/token'

interface BtiGitlabTokenResponse {
  token: string
}

interface GitLabJob {
  id: number
  name: string
}

runMain(async () => {
  const {
    positionals: [jobName],
  } = parseArgs({ allowPositionals: true })

  if (!LOCAL_BRANCH) {
    throw new Error('CI_COMMIT_REF_NAME is not set; cannot determine current branch.')
  }

  let pr: Awaited<ReturnType<typeof fetchPR>>
  try {
    pr = await fetchPR(LOCAL_BRANCH)
  } catch (error) {
    // Multiple open PRs for a single branch is ambiguous; leave the job manual
    // rather than fail the pipeline. See scripts/lib/gitUtils.ts `fetchPR`.
    if (error instanceof Error && error.message.includes('Multiple pull requests')) {
      printLog(`Multiple open PRs for this branch; ${jobName} remains manual.`)
      return
    }
    throw error
  }

  if (!pr || pr.draft) {
    printLog(
      pr
        ? `PR #${pr.number} is a draft; ${jobName} remains manual.`
        : `No open PR found for this branch; ${jobName} remains manual.`
    )
    return
  }

  // GitLab-injected predefined variables: https://docs.gitlab.com/ci/variables/predefined_variables/
  const { CI_API_V4_URL, CI_PROJECT_ID, CI_PIPELINE_ID } = process.env
  if (!CI_API_V4_URL || !CI_PROJECT_ID || !CI_PIPELINE_ID) {
    throw new Error('Missing GitLab CI environment variables required to play jobs via the API.')
  }

  const gitlabToken = await getGitlabProjectToken()

  const jobs = await gitlabApi<GitLabJob[]>(
    `${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/pipelines/${CI_PIPELINE_ID}/jobs?scope[]=manual`,
    gitlabToken
  )

  const job = jobs.find((j) => j.name === jobName)
  if (!job) {
    throw new Error(`Could not find manual job "${jobName}" in pipeline ${CI_PIPELINE_ID}.`)
  }

  await gitlabApi(`${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/jobs/${job.id}/play`, gitlabToken, 'POST')
  printLog(`PR #${pr.number} is open and ready for review; played ${jobName} (job id ${job.id}).`)
})

// Exchange the CI job's SDM JWT for a short-lived GitLab project access token via bti-ci-api.
// https://datadoghq.atlassian.net/wiki/spaces/DEVX/pages/5421924354
// https://datadoghq.atlassian.net/wiki/spaces/DEVX/pages/5318837137
async function getGitlabProjectToken(): Promise<string> {
  const jwt = command`authanywhere --audience sdm --raw`.run().trim()
  const response = await fetchHandlingError(`${BTI_CI_API_TOKEN_URL}?owner=DataDog&repository=browser-sdk`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  const { token } = (await response.json()) as BtiGitlabTokenResponse
  return token
}

async function gitlabApi<T = unknown>(url: string, token: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const response = await fetchHandlingError(url, {
    method,
    headers: { 'PRIVATE-TOKEN': token },
  })
  return (await response.json()) as T
}
