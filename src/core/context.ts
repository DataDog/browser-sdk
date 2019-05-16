import { getSessionId } from './session'
import { withSnakeCaseKeys } from './utils'

export type Context = any

export function getCommonContext() {
  return withSnakeCaseKeys({
    date: new Date().getTime(),
    http: {
      referer: window.location.href,
    },
    sessionId: getSessionId(),
  })
}
