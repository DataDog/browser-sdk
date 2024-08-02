'use strict'

const { printLog, printError, runMain, fetchHandlingError } = require('../lib/execution-utils')
const { command } = require('../lib/command')

const REPOSITORY = process.env.APP
const CURRENT_STAGING = process.env.CURRENT_STAGING
const DEVFLOW_AUTH_TOKEN = command`authanywhere --audience sdm`.run().split(' ')[2].trim()
const DEVFLOW_API_URL = 'https://devflow-api.us1.ddbuild.io/internal/api/v2/devflow/execute/'
const SUCESS_FEEDBACK_LEVEL = 'FEEDBACK_LEVEL_INFO'

runMain(async () => {
  const rawResponse = await fetchHandlingError(
    `${DEVFLOW_API_URL}/update-branch?repository=${REPOSITORY}&branch=${CURRENT_STAGING}`,
    {
      headers: {
        Authorization: `Bearer ${DEVFLOW_AUTH_TOKEN}`,
      },
    }
  )
  const jsonResponse = await rawResponse.json()

  printLog(jsonResponse)

  const isSuccess = jsonResponse.state.feedbacks[0].level === SUCESS_FEEDBACK_LEVEL
  const message = jsonResponse.state.feedbacks[0].message

  if (!isSuccess) {
    printError(message)
    throw new Error(message)
  }

  printLog(message)
})
