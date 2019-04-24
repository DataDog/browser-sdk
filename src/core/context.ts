import { getSessionId } from './session'

export type Context = any

let globalContext: Context = {}

export function setLoggerGlobalContext(context: Context) {
  globalContext = context
}

export function addLoggerGlobalContext(key: string, value: any) {
  globalContext[key] = value
}

export function getLoggerGlobalContext() {
  return globalContext
}

export function getCommonContext() {
  return {
    date: new Date().getTime(),
    http: {
      url: window.location.href,
      useragent: navigator.userAgent,
    },
    sessionId: getSessionId(),
  }
}
