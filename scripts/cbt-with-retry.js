'use strict'

const exec = require('child_process').exec

const [_, __, ...args] = process.argv
const COMMAND = `yarn ${args.join(' ')}`
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
    logs.indexOf('UnhandledRejection') !== -1 ||
    logs.indexOf('Request failed due to Error') !== -1 ||
    logs.indexOf('Failed to load resource') !== -1
  )
}

executeWithRetry()
