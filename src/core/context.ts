import { getSessionId } from './session'

export type Context = any

let globalContext: Context = {}

export function setGlobalContext(context: Context) {
  globalContext = context
}

export function addGlobalContext(key: string, value: any) {
  globalContext[key] = value
}

export function getGlobalContext() {
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
