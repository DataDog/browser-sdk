const util = require('util')
const fs = require('fs/promises')
const execute = util.promisify(require('child_process').exec)
const spawn = require('child_process').spawn
// node-fetch v3.x only support ESM syntax.
// Todo: Remove node-fetch when node v18 LTS is released with fetch out of the box
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))

const CI_FILE = '.gitlab-ci.yml'

async function getSecretKey(name) {
  const awsParameters = [
    'ssm',
    'get-parameter',
    '--region=us-east-1',
    '--with-decryption',
    '--query=Parameter.Value',
    '--out=text',
    `--name=${name}`,
  ]

  return (await executeCommand(`aws ${awsParameters.join(' ')}`)).trim()
}

async function initGitConfig(repository) {
  const githubDeployKey = await getSecretKey('ci.browser-sdk.github_deploy_key')

  await executeCommand(`ssh-add - <<< "${githubDeployKey}"`)
  await executeCommand('mkdir -p ~/.ssh')
  await executeCommand('chmod 700 ~/.ssh')
  await executeCommand('ssh-keyscan -H github.com >> ~/.ssh/known_hosts')
  await executeCommand('git config user.email "ci.browser-sdk@datadoghq.com"')
  await executeCommand('git config user.name "ci.browser-sdk"')
  await executeCommand(`git remote set-url origin ${repository}`)
}

async function replaceCiVariable(variableName, value) {
  await modifyFile(CI_FILE, (content) =>
    content.replace(new RegExp(`${variableName}: .*`), `${variableName}: ${value}`)
  )
}

/**
 * @param filePath {string}
 * @param modifier {(content: string) => string}
 */
async function modifyFile(filePath, modifier) {
  const content = await fs.readFile(filePath, { encoding: 'utf-8' })
  const modifiedContent = modifier(content)
  if (content !== modifiedContent) {
    await fs.writeFile(filePath, modifiedContent)
    return true
  }
  return false
}

async function executeCommand(command, envVariables) {
  const commandResult = await execute(command, {
    shell: '/bin/bash',
    env: { ...process.env, ...envVariables },
  })
  if (commandResult.error && commandResult.error.code !== 0) {
    throw commandResult.error
  }
  if (commandResult.stderr) {
    console.error(commandResult.stderr)
  }
  return commandResult.stdout
}

async function spawnCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true })
    child.on('error', reject)
    child.on('close', resolve)
    child.on('exit', resolve)
  })
}

function logAndExit(error) {
  printError('\nStacktrace:\n', error)
  process.exit(1)
}

const resetColor = '\x1b[0m'

function printError(...params) {
  const redColor = '\x1b[31;1m'
  console.log(redColor, ...params, resetColor)
}

function printLog(...params) {
  const greenColor = '\x1b[32;1m'
  console.log(greenColor, ...params, resetColor)
}

async function fetchWrapper(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

module.exports = {
  CI_FILE,
  getSecretKey,
  initGitConfig,
  executeCommand,
  spawnCommand,
  printError,
  printLog,
  logAndExit,
  replaceCiVariable,
  fetch: fetchWrapper,
  modifyFile,
}
