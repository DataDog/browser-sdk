const util = require('util')
const execute = util.promisify(require('child_process').exec)

function getSecretKey(name) {
  const awsParameters = [
    'ssm',
    'get-parameter',
    `--region=us-east-1`,
    '--with-decryption',
    '--query=Parameter.Value',
    '--out=text',
    `--name=${name}`,
  ]

  return executeCommand(`aws ${awsParameters.join(' ')}`)
}

async function initGitConfig(repository) {
  const githubDeployKey = await getSecretKey('ci.browser-sdk.github_deploy_key')

  await executeCommand(`ssh-add - <<< "${githubDeployKey}"`)
  await executeCommand(`mkdir -p ~/.ssh`)
  await executeCommand(`chmod 700 ~/.ssh`)
  await executeCommand(`ssh-keyscan -H github.com >> ~/.ssh/known_hosts`)
  await executeCommand(`git config user.email "browser-sdk-staging-reset@datadoghq.com"`)
  await executeCommand(`git config user.name "Gitlab staging reset job"`)
  await executeCommand(`git remote set-url origin ${repository}`)
}

async function executeCommand(command) {
  const commandResult = await execute(command, {
    shell: '/bin/bash',
  })
  if (commandResult.error && commandResult.error.code !== 0) {
    throw commandResult.error
  }
  if (commandResult.stderr) {
    console.error(commandResult.stderr)
  }
  return commandResult.stdout
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

module.exports = {
  initGitConfig,
  executeCommand,
  printError,
  printLog,
}
