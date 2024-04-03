import { SESSION_STORE_KEY, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import {
  getInitialSessionState,
  toSessionState,
  toSessionString,
} from '@datadog/browser-core/src/domain/session/sessionState'
import { setCookie } from './browser'

export async function renewSession() {
  await expireSession()
  const documentElement = await $('html')
  await documentElement.click()

  const session = await getSessionFromCookie()
  expect(session.id).not.toBe('null')
}

export async function expireSession() {
  await setCookie(SESSION_STORE_KEY, toSessionString(getInitialSessionState()), SESSION_TIME_OUT_DELAY)

  expect(await getSessionFromCookie()).toEqual(getInitialSessionState())

  // Cookies are cached for 1s, wait until the cache expires
  await browser.pause(1100)
}

export async function findSessionCookie() {
  const cookies = await browser.getCookies(SESSION_STORE_KEY)
  // In some case, the session cookie is returned but with an empty value. Let's consider it expired
  // in this case.
  return cookies[0]?.value || undefined
}

export async function getSessionFromCookie() {
  const cookies = await browser.getCookies(SESSION_STORE_KEY)

  return toSessionState(cookies[0]?.value)
}
