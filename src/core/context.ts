import { Session } from './session'
import { withSnakeCaseKeys } from './utils'

export interface Context {
  [x: string]: ContextValue
}

export type ContextValue = string | number | boolean | Context | ContextArray | undefined

export interface ContextArray extends Array<ContextValue> {}

export interface CommonContext {
  date: number
  http: {
    referer: string
  }
  sessionId: string
}

export function getCommonContext(session: Session) {
  return withSnakeCaseKeys({
    date: new Date().getTime(),
    http: {
      referer: window.location.href,
    },
    sessionId: session.getId(),
  })
}
