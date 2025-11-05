import os from 'node:os'
import fs from 'node:fs'
import { command } from './command.ts'
import {
  getGithubDeployKey,
  getGithubReadToken,
  getGithubReleaseToken,
  getGithubPullRequestToken,
  type OctoStsToken,
} from './secrets.ts'
import { FetchError, fetchHandlingError, findError } from './executionUtils.ts'

interface GitHubPR {
  // eslint-disable-next-line id-denylist
  number: number
  title: string
  body: string
  base: {
    ref: string
  }
}

interface GitHubRelease {
  html_url: string
}

interface GitHubReleaseParams {
  version: string
  body: string
}

export async function fetchPR(localBranch: string): Promise<GitHubPR | null> {
  using readToken = getGithubReadToken()
  const pr = await callGitHubApi<GitHubPR[]>('GET', `pulls?head=DataDog:${localBranch}`, readToken)
  if (pr && pr.length > 1) {
    throw new Error('Multiple pull requests found for the branch')
  }
  return pr ? pr[0] : null
}

/**
 * Create a GitHub release.
 *
 * @param params - The parameters for the GitHub release.
 * @param params.version - The version to create a release for.
 * @param params.body - The body of the release.
 */
export async function createGitHubRelease({ version, body }: GitHubReleaseParams): Promise<GitHubRelease> {
  using readToken = getGithubReadToken()
  try {
    await callGitHubApi('GET', `releases/tags/${version}`, readToken)
    throw new Error(`Release ${version} already exists`)
  } catch (error) {
    const fetchError = findError(error, FetchError)
    if (!fetchError || fetchError.response.status !== 404) {
      throw error
    }
  }

  // content write
  using releaseToken = getGithubReleaseToken()
  return await callGitHubApi<GitHubRelease>('POST', 'releases', releaseToken, {
    tag_name: version,
    name: version,
    body,
  })
}

export function createPullRequest(mainBranch: string) {
  using token = getGithubPullRequestToken()
  command`gh auth login --with-token`.withInput(token.value).run()
  const pullRequestUrl = command`gh pr create --fill --base ${mainBranch}`.run()
  return pullRequestUrl.trim()
}

export function getLastCommonCommit(baseBranch: string): string {
  try {
    command`git fetch --depth=100 origin ${baseBranch}`.run()
    const commandOutput = command`git merge-base origin/${baseBranch} HEAD`.run()
    // SHA commit is truncated to 8 characters as bundle sizes commit are exported in short format to logs for convenience and readability.
    return commandOutput.trim().substring(0, 8)
  } catch (error) {
    throw new Error('Failed to get last common commit', { cause: error })
  }
}

export function initGitConfig(repository: string): void {
  const homedir = os.homedir()

  // ssh-add expects a new line at the end of the PEM-formatted private key
  // https://stackoverflow.com/a/59595773
  command`ssh-add -`.withInput(`${getGithubDeployKey()}\n`).run()
  command`mkdir -p ${homedir}/.ssh`.run()
  command`chmod 700 ${homedir}/.ssh`.run()
  const sshHost = command`ssh-keyscan -H github.com`.run()
  fs.appendFileSync(`${homedir}/.ssh/known_hosts`, sshHost)
  command`git config user.email ci.browser-sdk@datadoghq.com`.run()
  command`git config user.name ci.browser-sdk`.run()
  command`git remote set-url origin ${repository}`.run()
}
export const LOCAL_BRANCH = process.env.CI_COMMIT_REF_NAME

async function callGitHubApi<T>(method: string, path: string, token: OctoStsToken, body?: any): Promise<T> {
  try {
    const response = await fetchHandlingError(`https://api.github.com/repos/DataDog/browser-sdk/${path}`, {
      method,
      headers: {
        Authorization: `token ${token.value}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return (await response.json()) as Promise<T>
  } catch (error) {
    throw new Error(`Failed to call GitHub API: ${method} ${path}`, { cause: error })
  }
}
