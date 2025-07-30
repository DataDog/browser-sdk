import type { CommonContext } from '../../rawLogsEvent.types'
import { globalVar } from '@datadog/browser-core'
import { isServiceWorkerContext } from '@datadog/browser-core'

export function buildCommonContext(): CommonContext {
  return {
    view: {
      referrer: isServiceWorkerContext() ? '' : (globalVar.document?.referrer || ''),
      url: globalVar.location?.href || '',
    },
  }
}
