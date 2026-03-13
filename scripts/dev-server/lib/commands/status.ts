import { printWarning } from '../../../lib/executionUtils.ts'
import { readState, isRunning, printStatus } from '../state.ts'

export function status(): void {
  const state = readState()

  if (state && isRunning(state.pid)) {
    printStatus(state)
  } else {
    printWarning('Dev server is not running.')
  }
}
