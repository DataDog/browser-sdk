import { spawn } from 'node:child_process'

/**
 * Helper to run executables asynchronously, in a shell. This function does not prevent Shell
 * injections[0], so please use carefully. Only use it to run commands with trusted arguments.
 * Prefer the `command` helper for most use cases.
 *
 * [0]: https://matklad.github.io/2021/07/30/shell-injection.html
 */
export function spawnCommand(command: string, args: string[]): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args || [], { stdio: 'inherit', shell: true })
    child.on('error', reject)
    child.on('close', resolve)
    child.on('exit', resolve)
  })
}

export function runMain(mainFunction: () => void | Promise<void>): void {
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

export function printError(...params: any[]): void {
  const redColor = '\x1b[31;1m'
  console.log(redColor, ...params, resetColor)
}

export function printLog(...params: any[]): void {
  const greenColor = '\x1b[32;1m'
  console.log(greenColor, ...params, resetColor)
}

export function printWarning(...params: any[]): void {
  const yellowColor = '\x1b[33;1m'
  console.log(yellowColor, ...params, resetColor)
}

export function formatSize(bytes: number | null, { includeSign = false } = {}): string {
  if (bytes === null) {
    return 'N/A'
  }

  const sign = includeSign && bytes > 0 ? '+' : ''

  if (bytes > -1024 && bytes < 1024) {
    return `${sign}${Math.round(bytes)} B`
  }

  return `${sign}${(bytes / 1024).toFixed(2)} KiB`
}

export function formatPercentage(percentage: number, { includeSign = false } = {}): string {
  const sign = includeSign && percentage > 0 ? '+' : ''
  return `${sign}${(percentage * 100).toFixed(2)}%`
}

/**
 * Find an error of type T in the provided error or its causes.
 */
export function findError<T>(error: unknown, type: new (...args: any[]) => T): T | undefined {
  while (error) {
    if (error instanceof type) {
      return error
    }
    if (error instanceof Error && error.cause) {
      error = error.cause
    } else {
      break
    }
  }
}

export class FetchError extends Error {
  public readonly response: Response

  constructor(response: Response, options?: ErrorOptions) {
    super(`HTTP Error Response: ${response.status} ${response.statusText}`, options)
    this.response = response
  }
}

export async function fetchHandlingError(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options)
  if (!response.ok) {
    let cause: unknown
    const body = await response.text()
    try {
      cause = JSON.parse(body)
    } catch {
      cause = body
    }
    throw new FetchError(response, { cause })
  }

  return response
}

export function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
