const os = require('os')
const fs = require('fs')

const { command } = require('../lib/command')
const { getGithubDeployKey, getGithubAccessToken } = require('./secrets')
const { fetchHandlingError } = require('./executionUtils')

async function fetchPR(localBranch) {
  const response = await fetchHandlingError(
    `https://api.github.com/repos/DataDog/browser-sdk/pulls?head=DataDog:${localBranch}`,
    {
      method: 'GET',
      headers: {
        Authorization: `token ${getGithubAccessToken()}`,
      },
    }
  )
  const pr = response.body ? await response.json() : null
  if (pr && pr.length > 1) {
    throw new Error('Multiple pull requests found for the branch')
  }
  return pr ? pr[0] : null
}

function getLastCommonCommit(baseBranch) {
  try {
    command`git fetch --depth=100 origin ${baseBranch}`.run()
    const commandOutput = command`git merge-base origin/${baseBranch} HEAD`.run()
    // SHA commit is truncated to 8 characters as bundle sizes commit are exported in short format to logs for convenience and readability.
    return commandOutput.trim().substring(0, 8)
  } catch (error) {
    throw new Error('Failed to get last common commit', { cause: error })
  }
}

function initGitConfig(repository) {
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

module.exports = {
  initGitConfig,
  fetchPR,
  getLastCommonCommit,
  LOCAL_BRANCH: process.env.CI_COMMIT_REF_NAME,
}
