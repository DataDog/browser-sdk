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
}

export function getCommonContext() {
  return withSnakeCaseKeys({
    date: new Date().getTime(),
    http: {
      referer: window.location.href,
    },
  })
}
