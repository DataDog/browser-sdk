import os from 'os'
import fs from 'fs'
import { command } from './command.ts'
import { getGithubDeployKey, getGithubAccessToken } from './secrets.ts'
import { fetchHandlingError } from './executionUtils.ts'

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

async function fetchPR(localBranch: string): Promise<GitHubPR | null> {
  const pr = await callGitHubApi<GitHubPR[]>('GET', `pulls?head=DataDog:${localBranch}`)
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
async function createGitHubRelease({ version, body }: GitHubReleaseParams): Promise<GitHubRelease> {
  try {
    await callGitHubApi('GET', `releases/tags/${version}`)
    throw new Error(`Release ${version} already exists`)
  } catch (error) {
    if ((error as any).status !== 404) {
      throw error
    }
  }

  return callGitHubApi('POST', 'releases', {
    tag_name: version,
    name: version,
    body,
  })
}

async function callGitHubApi<T>(method: string, path: string, body?: any): Promise<T> {
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

function getLastCommonCommit(baseBranch: string): string {
  try {
    command`git fetch --depth=100 origin ${baseBranch}`.run()
    const commandOutput = command`git merge-base origin/${baseBranch} HEAD`.run()
    // SHA commit is truncated to 8 characters as bundle sizes commit are exported in short format to logs for convenience and readability.
    return commandOutput.trim().substring(0, 8)
  } catch (error) {
    throw new Error('Failed to get last common commit', { cause: error })
  }
}

function initGitConfig(repository: string): void {
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

export { initGitConfig, fetchPR, getLastCommonCommit, createGitHubRelease }

export const LOCAL_BRANCH = process.env.CI_COMMIT_REF_NAME
