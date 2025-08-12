import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(): CommonContext {
  const isSW = typeof self !== 'undefined' && 'serviceWorker' in self

  if (isSW) {
    return {
      view: {
        referrer: '',
        url: self.serviceWorker ? self.serviceWorker.scriptURL : '',
      },
    }
  }

  return {
    view: {
      referrer: document.referrer,
      url: window.location.href,
    },
  }
}
