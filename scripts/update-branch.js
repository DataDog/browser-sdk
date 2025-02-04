'use strict'

const { parseArgs } = require('node:util')
const { printLog, runMain, fetchHandlingError } = require('./lib/executionUtils')
const { command } = require('./lib/command')

const REPOSITORY = process.env.APP
const DEVFLOW_AUTH_TOKEN = command`authanywhere --audience sdm --raw`.run()
const DEVFLOW_API_URL = 'https://devflow-api.us1.ddbuild.io/internal/api/v2/devflow/execute/'
const SUCESS_FEEDBACK_LEVEL = 'FEEDBACK_LEVEL_INFO'

runMain(async () => {
  const args = parseArgs({ allowPositionals: true })
  const [branch] = args.positionals

  await updateBranch(branch)

  // `update-branch` allways skips CI, so we need to trigger it manually
  await triggerCi(branch)
})

async function updateBranch(branch) {
  const message = await devFlow('update-branch', { branch })

  printLog(message)
}

async function triggerCi(branch) {
  const message = await devFlow('trigger-ci', { ref: branch })

  printLog(message)
}

async function devFlow(action, options) {
  const params = getDevFlowURLSearchParams(options)
  const rawResponse = await fetchHandlingError(`${DEVFLOW_API_URL}/${action}?${params}`, {
    headers: {
      Authorization: `Bearer ${DEVFLOW_AUTH_TOKEN}`,
    },
  })

  const jsonResponse = await rawResponse.json()

  const isSuccess = jsonResponse.state.feedbacks[0].level === SUCESS_FEEDBACK_LEVEL
  const message = jsonResponse.state.feedbacks[0].message

  if (!isSuccess) {
    throw new Error(message)
  }

  return message
}

function getDevFlowURLSearchParams(options) {
  const params = new URLSearchParams({
    repository: REPOSITORY,
    ...options,
  })

  return params.toString()
}
