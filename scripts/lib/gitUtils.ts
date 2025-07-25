import * as os from 'os'
import * as fs from 'fs'

import { command } from './command'
import { getGithubDeployKey, getGithubAccessToken } from './secrets'
import { fetchHandlingError } from './executionUtils'

interface GitHubPullRequest {
  [key: string]: any // GitHub PR object has many properties
}

interface GitHubRelease {
  [key: string]: any // GitHub Release object has many properties
}

interface CreateGitHubReleaseParams {
  version: string
  body: string
}

export async function fetchPR(localBranch: string): Promise<GitHubPullRequest | null> {
  const pr = await callGitHubApi<GitHubPullRequest[]>('GET', `pulls?head=DataDog:${localBranch}`)
  if (pr && pr.length > 1) {
    throw new Error('Multiple pull requests found for the branch')
  }
  return pr ? pr[0] : null
}

/**
 * Create a GitHub release.
 *
 * @param {Object} params - The parameters for the GitHub release.
 * @param {string} params.version - The version to create a release for.
 * @param {string} params.body - The body of the release.
 */
export async function createGitHubRelease({ version, body }: CreateGitHubReleaseParams): Promise<GitHubRelease> {
  try {
    await callGitHubApi('GET', `releases/tags/${version}`)
    throw new Error(`Release ${version} already exists`)
  } catch (error: any) {
    if (error.status !== 404) {
      throw error
    }
  }

  return callGitHubApi<GitHubRelease>('POST', 'releases', {
    tag_name: version,
    name: version,
    body,
  })
}

async function callGitHubApi<T = any>(method: string, path: string, body?: any): Promise<T> {
  const response = await fetchHandlingError(`https://api.github.com/repos/DataDog/browser-sdk/${path}`, {
    method,
    headers: {
      Authorization: `token ${getGithubAccessToken()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return response.json() as Promise<T>
}

export function getLastCommonCommit(baseBranch: string): string {
  try {
    command`git fetch --depth=100 origin ${baseBranch}`.run()
    const commandOutput = command`git merge-base origin/${baseBranch} HEAD`.run()
    // SHA commit is truncated to 8 characters as bundle sizes commit are exported in short format to logs for convenience and readability.
    return commandOutput.trim().substring(0, 8)
  } catch (error) {
    const newError = new Error('Failed to get last common commit')
    ;(newError as any).cause = error
    throw newError
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
