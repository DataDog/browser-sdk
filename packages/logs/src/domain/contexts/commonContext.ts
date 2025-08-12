import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(): CommonContext {
  const isSW = typeof self !== 'undefined' && 'serviceWorker' in self

  if (isSW) {
    return {
      view: {
        referrer: '',
        url: 'serviceWorker' in self ? (self.serviceWorker as { scriptURL: string })?.scriptURL : '',
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
