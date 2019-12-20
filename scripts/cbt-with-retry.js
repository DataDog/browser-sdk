'use strict'

const exec = require('child_process').exec

const [_, __, ...args] = process.argv
const COMMAND = `yarn ${args.join(' ')}`
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
        console.log(`\n${COMMAND} (Retry ${retryCount}/${MAX_RETRY_COUNT})\n\n`)
        executeWithRetry()
      }
    } else {
      process.exit(code)
    }
  })
}

function isRetryAllowed(logs) {
  return logs.indexOf('UnhandledRejection') !== -1
}

executeWithRetry()
