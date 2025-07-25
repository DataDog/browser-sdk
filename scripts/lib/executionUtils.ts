import { spawn } from 'child_process'

/**
 * Helper to run executables asynchronously, in a shell. This function does not prevent Shell
 * injections[0], so please use carefully. Only use it to run commands with trusted arguments.
 * Prefer the `command` helper for most use cases.
 *
 * [0]: https://matklad.github.io/2021/07/30/shell-injection.html
 */
function spawnCommand(command: string, args: string[]): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true })
    child.on('error', reject)
    child.on('close', resolve)
    child.on('exit', resolve)
  })
}

function runMain(mainFunction: () => void | Promise<void>): void {
  Promise.resolve()
    // The main function can be either synchronous or asynchronous, so let's wrap it in an async
    // callback that will catch both thrown errors and rejected promises
    .then(() => mainFunction())
    .catch((error) => {
      printError('\nScript exited with error:', error)
      process.exit(1)
    })
}

const resetColor = '\x1b[0m'

function printError(...params: any[]): void {
  const redColor = '\x1b[31;1m'
  console.log(redColor, ...params, resetColor)
}

function printLog(...params: any[]): void {
  const greenColor = '\x1b[32;1m'
  console.log(greenColor, ...params, resetColor)
}

interface FetchError extends Error {
  status?: number
}

async function fetchHandlingError(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const error = new Error(`HTTP Error Response: ${response.status} ${response.statusText}`) as FetchError
    error.status = response.status
    throw error
  }

  return response
}

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { spawnCommand, printError, printLog, runMain, fetchHandlingError, timeout }
