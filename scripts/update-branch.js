'use strict'

const { parseArgs } = require('node:util')
const { printLog, printError, runMain, fetchHandlingError } = require('./lib/executionUtils')
const { command } = require('./lib/command')

const REPOSITORY = process.env.APP
const DEVFLOW_AUTH_TOKEN = command`authanywhere --audience sdm --raw`.run()
const DEVFLOW_API_URL = 'https://devflow-api.us1.ddbuild.io/internal/api/v2/devflow/execute/'
const FEEDBACK_LEVEL_FAILURE = 'FEEDBACK_LEVEL_FAILURE'

runMain(async () => {
  const args = parseArgs({ allowPositionals: true })
  const [branch] = args.positionals

  await updateBranch(branch)

  // `update-branch` always skips CI, so we need to trigger it manually
  await triggerCi(branch)
})

async function updateBranch(branch) {
  await devFlow('update-branch', { branch })
}

async function triggerCi(branch) {
  await devFlow('trigger-ci', { ref: branch })
}

async function devFlow(action, options) {
  const params = getDevFlowURLSearchParams(options)
  const rawResponse = await fetchHandlingError(`${DEVFLOW_API_URL}/${action}?${params}`, {
    headers: {
      Authorization: `Bearer ${DEVFLOW_AUTH_TOKEN}`,
    },
  })

  const jsonResponse = await rawResponse.json()

  let isSuccess = true
  for (const feedback of jsonResponse.state.feedbacks) {
    if (feedback.level === FEEDBACK_LEVEL_FAILURE) {
      isSuccess = false
    }
    const print = feedback.level === FEEDBACK_LEVEL_FAILURE ? printError : printLog
    print(feedback.title)
    if (feedback.message) {
      print(feedback.message)
    }
    if (feedback.details_url) {
      print(`Details: ${feedback.details_url}`)
    }
  }

  if (!isSuccess) {
    throw new Error(`DevFlow action "${action}" failed`)
  }
}

function getDevFlowURLSearchParams(options) {
  const params = new URLSearchParams({
    repository: REPOSITORY,
    ...options,
  })

  return params.toString()
}
