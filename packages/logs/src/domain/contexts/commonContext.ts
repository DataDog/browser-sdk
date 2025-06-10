import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(): CommonContext {
  return {
    view: {
      referrer: document.referrer,
      url: window.location.href,
    },
  }
}
