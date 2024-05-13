const spawn = require('child_process').spawn

/**
 * Helper to run executables asynchronously, in a shell. This function does not prevent Shell
 * injections[0], so please use carefully. Only use it to run commands with trusted arguments.
 * Prefer the `command` helper for most use cases.
 *
 * [0]: https://matklad.github.io/2021/07/30/shell-injection.html
 */
function spawnCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true })
    child.on('error', reject)
    child.on('close', resolve)
    child.on('exit', resolve)
  })
}

function runMain(mainFunction) {
  Promise.resolve()
    // The main function can be either synchronous or asynchronous, so let's wrap it in an async
    // callback that will catch both thrown errors and rejected promises
    .then(() => mainFunction())
    .catch((error) => {
      printError('\nScript exited with error:')
      printErrorWithCause(error)
      process.exit(1)
    })
}

const resetColor = '\x1b[0m'

function printError(...params) {
  const redColor = '\x1b[31;1m'
  console.log(redColor, ...params, resetColor)
}

function printErrorWithCause(error) {
  printError(error)
  if (error.cause) {
    printError('Caused by:')
    printErrorWithCause(error.cause)
  }
}

function printLog(...params) {
  const greenColor = '\x1b[32;1m'
  console.log(greenColor, ...params, resetColor)
}

async function fetchHandlingError(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
  }

  return response
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = {
  spawnCommand,
  printError,
  printLog,
  runMain,
  fetchHandlingError,
  timeout,
}
