import { SESSION_STORE_KEY, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { SessionState } from '@datadog/browser-core'
import { setCookie } from './browser'

export async function renewSession() {
  await expireSession()
  const documentElement = await $('html')
  await documentElement.click()

  expect((await findSessionCookie())?.isExpired).not.toEqual('1')
}

export async function expireSession() {
  // mock expire session with anonymous id
  const cookies = await browser.getCookies(SESSION_STORE_KEY)
  const anonymousId = cookies[0]?.value.match(/aid=[a-z0-9-]+/)
  const expireCookie = `isExpired=1&${anonymousId && anonymousId[0]}`

  await setCookie(SESSION_STORE_KEY, expireCookie, SESSION_TIME_OUT_DELAY)

  expect((await findSessionCookie())?.isExpired).toEqual('1')

  // Cookies are cached for 1s, wait until the cache expires
  await browser.pause(1100)
}

export async function findSessionCookie() {
  const cookies = await browser.getCookies(SESSION_STORE_KEY)
  // In some case, the session cookie is returned but with an empty value. Let's consider it expired
  // in this case.
  const rawValue = cookies[0]?.value
  if (!rawValue) {
    return
  }
  return Object.fromEntries(rawValue.split('&').map((part: string) => part.split('='))) as SessionState
}
