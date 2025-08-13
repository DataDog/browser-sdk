import { globalObject } from '@datadog/browser-core'
import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(): CommonContext {
  return {
    view: {
      referrer: globalObject.document?.referrer ?? '',
      url: globalObject.location.href,
    },
  }
}
