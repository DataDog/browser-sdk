import { parseArgs } from 'node:util'
import { printLog, printWarning } from '../../../lib/executionUtils.ts'
import { readState, clearState, isRunning } from '../state.ts'

export function stop(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { help: { type: 'boolean', short: 'h' } },
  })

  if (values.help) {
    printLog(`Usage: yarn dev-server stop

Options:
  -h, --help     Show this message`)
    return
  }

  const state = readState()

  if (!state || !isRunning(state.pid)) {
    printWarning('Dev server is not running.')
    clearState()
    return
  }

  process.kill(state.pid)
  clearState()
  printLog('Dev server stopped.')
}
