import { globalVar } from '@datadog/browser-core'
import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(): CommonContext {
  return {
    view: {
      referrer: '',
      url: globalVar.location?.href || '',
    },
  }
}
