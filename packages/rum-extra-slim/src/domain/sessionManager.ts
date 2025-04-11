import { generateUUID, setCookie, ONE_YEAR, getInitCookie } from '@datadog/browser-core'
import { toSessionState } from '@datadog/browser-core/src/domain/session/sessionState'
import { createCookieObservable } from '@datadog/browser-rum-core/src/browser/cookieObservable'

const COOKIE = '_dd_xs'

export type SessionManager = ReturnType<typeof startSessionManager>

export function startSessionManager() {
  const contextId = generateUUID()
  let clientId: string | undefined

  const { cid } = toSessionState(getInitCookie(COOKIE))

  if (!cid) {
    setNewClientId()
  } else {
    clientId = cid
  }

  const cookieObservable = createCookieObservable(COOKIE)

  function setNewClientId() {
    clientId = generateUUID()
    setCookie(COOKIE, `cid=${clientId}`, ONE_YEAR)
  }

  const subscription = cookieObservable.subscribe((cookieValue) => {
    if (!cookieValue) {
      return setNewClientId()
    }

    const { cid } = toSessionState(cookieValue)

    if (!cid) {
      return setNewClientId()
    }

    clientId = cid
  })

  return {
    clientId,
    contextId,
    stop: () => subscription.unsubscribe(),
  }
}
