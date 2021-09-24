'use strict'

const fs = require('fs')
const { promisify } = require('util')
const execute = promisify(require('child_process').exec)
const replace = require('replace-in-file')

const CI_FILE = '.gitlab-ci.yml'
const REPOSITORY = 'git@github.com:DataDog/browser-sdk.git'
const MAIN_BRANCH = 'main'

const CURRENT_STAGING_BRANCH = process.env.CURRENT_STAGING
const NEW_STAGING_NUMBER = getWeekNumber().toString().padStart(2, '0')
const NEW_STAGING_BRANCH = `staging-${NEW_STAGING_NUMBER}`

async function main() {
  // used to share the new staging name to the notification jobs
  await executeCommand(`echo "NEW_STAGING=${NEW_STAGING_BRANCH}" >> build.env`)

  await initGitConfig()
  await executeCommand(`git fetch --no-tags origin ${MAIN_BRANCH} ${CURRENT_STAGING_BRANCH}`)
  await executeCommand(`git checkout ${MAIN_BRANCH} -f`)
  await executeCommand(`git pull`)

  const isNewBranch = CURRENT_STAGING_BRANCH !== NEW_STAGING_BRANCH
  if (isNewBranch) {
    console.log(`Changing staging branch in ${CI_FILE}...`)
    await replace({
      files: CI_FILE,
      from: /CURRENT_STAGING: staging-.*/g,
      to: `CURRENT_STAGING: ${NEW_STAGING_BRANCH}`,
    })
    await executeCommand(`git commit ${CI_FILE} -m "👷 Bump staging to ${NEW_STAGING_BRANCH}"`)
    await executeCommand(`git push origin ${MAIN_BRANCH}`)
  } else {
    console.log(`Staging branch already up to date in ${CI_FILE}. Skipping.`)
  }

  const isStagingAlreadyCreated = await executeCommand(`git ls-remote --heads ${REPOSITORY} ${NEW_STAGING_BRANCH}`)
  if (!isStagingAlreadyCreated) {
    console.log(`Creating the new staging branch...`)
    await executeCommand(`git checkout -b ${NEW_STAGING_BRANCH}`)
    await executeCommand(`git push origin ${NEW_STAGING_BRANCH}`)
  } else {
    console.log(`New staging branch already created. Skipping.`)
  }

  await executeCommand(`git checkout ${CURRENT_STAGING_BRANCH}`)
  await executeCommand(`git pull`)

  if (isNewBranch && fs.existsSync(CI_FILE)) {
    console.log(`Disabling CI on the old branch...`)
    await executeCommand(`git rm ${CI_FILE}`)
    await executeCommand(`git commit ${CI_FILE} -m "Remove ${CI_FILE} on old branch so pushes are noop"`)
    await executeCommand(`git push origin ${CURRENT_STAGING_BRANCH}`)
  } else {
    console.log(`CI already disabled on the old branch. Skipping.`)
  }

  console.log('Reset Done.')
}

async function initGitConfig() {
  const GITHUB_DEPLOY_KEY = await getSecretKey('ci.browser-sdk.github_deploy_key')

  await executeCommand(`ssh-add - <<< "${GITHUB_DEPLOY_KEY}"`)
  await executeCommand(`mkdir -p ~/.ssh`)
  await executeCommand(`chmod 700 ~/.ssh`)
  await executeCommand(`ssh-keyscan -H github.com >> ~/.ssh/known_hosts`)
  await executeCommand(`git config user.email "browser-sdk-staging-reset@datadoghq.com"`)
  await executeCommand(`git config user.name "Gitlab staging reset job"`)
  await executeCommand(`git remote set-url origin ${REPOSITORY}`)
}

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

function getWeekNumber() {
  const today = new Date()
  const yearStart = new Date(today.getUTCFullYear(), 0, 1)
  return Math.ceil(((today - yearStart) / 86400000 + yearStart.getUTCDay() + 1) / 7)
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

main().catch((e) => {
  console.error('Error occurred:', e)
  process.exit(1)
})
