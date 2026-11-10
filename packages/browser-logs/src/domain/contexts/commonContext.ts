import { globalObject } from '@datadog/js-core/util'
import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(): CommonContext {
  // window is not available in Web Workers and non-browser environments (SSR)
  const browserWindow = globalObject.window
  if (!browserWindow) {
    return {}
  }

  return {
    view: {
      referrer: browserWindow.document.referrer,
      url: browserWindow.location.href,
    },
  }
}
