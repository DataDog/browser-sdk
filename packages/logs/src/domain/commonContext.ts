import type { CommonContext } from '../rawLogsEvent.types'

export function getBuildLogsCommonContext(): () => CommonContext {
  throw new Error('No logs common context')
}
