'use strict'

const exec = require('child_process').exec

const COMMAND = `yarn ${process.argv.slice(2).join(' ')}`
const RETRY_DELAY_IN_MIN = 5
const MAX_RETRY_COUNT = 3
let retryCount = 0

function executeWithRetry() {
  let logs = ''
  const current = exec(COMMAND)
  current.stdout.pipe(process.stdout)
  current.stdout.on('data', (data) => (logs += data))
  current.on('exit', (code) => {
    if (code !== 0 && isRetryAllowed(logs)) {
      if (retryCount < MAX_RETRY_COUNT) {
        retryCount += 1
        console.log(`\nRetry in ${RETRY_DELAY_IN_MIN} min\n\n`)
        setTimeout(() => {
          console.log(`\n${COMMAND} (Retry ${retryCount}/${MAX_RETRY_COUNT})\n\n`)
          executeWithRetry()
        }, RETRY_DELAY_IN_MIN * 60 * 1000)
      }
    } else {
      process.exit(code)
    }
  })
}

function isRetryAllowed(logs) {
  return (
    logs.includes('UnhandledRejection') ||
    logs.includes('Request failed due to Error') ||
    logs.includes('ESOCKETTIMEDOUT') ||
    logs.includes('WebSocket error') ||
    logs.includes('Failed to load resource')
  )
}

executeWithRetry()
