'use strict'

const path = require('path')
const exec = require('child_process').exec

const rootDirectory = path.join(__dirname, '..')
const COMMAND = `${rootDirectory}/node_modules/.bin/karma start ${rootDirectory}/test/unit/karma.cbt.conf.js`
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
