import { createGitHubRelease } from '../lib/gitUtils.ts'
import { printLog, runMain } from '../lib/executionUtils.ts'

interface GitHubReleaseResponse {
  html_url: string
}

runMain(async () => {
  const response = (await createGitHubRelease({
    version: 'test-octo-1',
    body: 'This is a test release created from the GitLab pipeline.',
  })) as GitHubReleaseResponse

  printLog(`GitHub release created: ${response.html_url}`)
})
