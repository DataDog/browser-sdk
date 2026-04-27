import { parseArgs } from 'node:util'
import { printLog, printWarning } from '../../../lib/executionUtils.ts'
import { readState, isRunning, printStatus } from '../state.ts'

export function status(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { help: { type: 'boolean', short: 'h' } },
  })

  if (values.help) {
    printLog(`Usage: yarn dev-server status

Options:
  -h, --help     Show this message`)
    return
  }

  const state = readState()

  if (state && isRunning(state.pid)) {
    printStatus(state)
  } else {
    printWarning('Dev server is not running.')
  }
}
