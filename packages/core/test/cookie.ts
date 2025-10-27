import { getCookie, setCookie } from '../src/browser/cookie'
import { toSessionState } from '../src/domain/session/sessionState'
import { SESSION_STORE_KEY } from '../src/domain/session/storeStrategies/sessionStoreStrategy'
import { ONE_MINUTE } from '../src/tools/utils/timeUtils'

export function expireCookie() {
  setCookie(SESSION_STORE_KEY, 'isExpired=1', ONE_MINUTE)
}

export function getSessionState(sessionStoreKey: string) {
  const sessionState = toSessionState(getCookie(sessionStoreKey))
  // remove the cookie options from the session state so the test works the same way as the code
  // see: packages/core/src/domain/session/storeStrategies/sessionInCookie.ts:148
  delete sessionState.c
  return sessionState
}

interface Cookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  partitioned?: boolean
}

export function mockCookies({ filter }: { filter?: (cookie: Cookie) => boolean } = {}) {
  let cookies: Cookie[] = []

  const documentPrototype =
    'cookie' in Document.prototype
      ? Document.prototype
      : // Firefox 67 doesn't define `cookie` on `Document.prototype`
        HTMLDocument.prototype

  const getter = spyOnProperty(documentPrototype, 'cookie', 'get').and.callFake(() => {
    removeExpiredCookies()
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join(';')
  })

  const setter = spyOnProperty(documentPrototype, 'cookie', 'set').and.callFake((cookieString) => {
    const cookie = parseSingleCookieString(cookieString)

    if (filter && !filter(cookie)) {
      return
    }

    const matchingCookieIndex = cookies.findIndex(
      (otherCookie) =>
        cookie.name === otherCookie.name && cookie.domain === otherCookie.domain && cookie.path === otherCookie.path
    )
    if (matchingCookieIndex !== -1) {
      cookies[matchingCookieIndex] = cookie
    } else {
      cookies.push(cookie)
    }
    removeExpiredCookies()
  })

  function removeExpiredCookies() {
    cookies = cookies.filter((cookie) => cookie.expires && cookie.expires > Date.now())
  }

  return {
    getCookies: () => {
      removeExpiredCookies()
      return cookies
    },
    getter,
    setter,
  }
}

function parseSingleCookieString(cookieString: string) {
  const parts = cookieString.split(';')
  const [name, value] = parts.shift()!.split('=')
  const parsedCookie: Cookie = {
    name,
    value,
  }

  for (const part of parts) {
    const parsedPart = part.match(/^\s*([^=]*)(?:=(.*))?/)
    if (!parsedPart) {
      continue
    }

    const name = parsedPart[1].toLowerCase()
    const value: string | undefined = parsedPart[2]

    if (value) {
      if (name === 'domain') {
        parsedCookie.domain = value.startsWith('.') ? value : `.${value}`
      } else if (name === 'path') {
        parsedCookie.path = value
      } else if (name === 'expires') {
        parsedCookie.expires = new Date(value).getTime()
      } else if (name === 'max-age') {
        parsedCookie.expires = Date.now() + Number(value) * 1000
      } else if (name === 'samesite') {
        parsedCookie.sameSite = value as Cookie['sameSite']
      }
    } else if (name === 'partitioned') {
      parsedCookie.partitioned = true
    } else if (name === 'secure') {
      parsedCookie.secure = true
    }
  }
  return parsedCookie
}
