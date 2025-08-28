import { isWorkerEnvironment } from '@datadog/browser-core'
import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(): CommonContext {
  if (isWorkerEnvironment) {
    return {}
  }

  return {
    view: {
      referrer: document.referrer,
      url: window.location.href,
    },
  }
}
