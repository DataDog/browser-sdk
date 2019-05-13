import { getSessionId } from './session'

export type Context = any

export function getCommonContext() {
  return {
    date: new Date().getTime(),
    http: {
      referer: window.location.href,
      useragent: navigator.userAgent,
    },
    sessionId: getSessionId(),
  }
}
