const util = require('util')
const execute = util.promisify(require('child_process').exec)
const spawn = require('child_process').spawn

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
  await executeCommand(`git config user.email "ci.browser-sdk@datadoghq.com"`)
  await executeCommand(`git config user.name "ci.browser-sdk"`)
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

async function spawnCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true })
    child.on('error', reject)
    child.on('close', resolve)
    child.on('exit', resolve)
  })
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
  spawnCommand,
  printError,
  printLog,
}
