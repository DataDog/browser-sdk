import { printLog, printWarning } from '../../../lib/executionUtils.ts'
import { readState, clearState, isRunning } from '../state.ts'

export function stop(): void {
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
