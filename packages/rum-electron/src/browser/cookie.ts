// eslint-disable-next-line local-rules/disallow-side-effects
import { session } from 'electron'

export interface CookieOptions {
  secure?: boolean
  crossSite?: boolean
  domain?: string
}

export async function setCookie(name: string, value: string, expireDelay: number, options?: CookieOptions) {
  const date = new Date()
  date.setTime(date.getTime() + expireDelay)
  const sameSite = options && options.crossSite ? 'no_restriction' : 'strict'
  const domain = options && options.domain
  const secure = options && options.secure
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  await session.defaultSession.cookies.set({
    url: `${secure ? 'https' : 'http'}://dd-sdk`,
    domain,
    secure,
    sameSite,
    expirationDate: date.getTime(),
    name,
    value,
  })
}

export async function getCookie(name: string): Promise<string | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const cookies = await session.defaultSession.cookies.get({ name })
  return cookies.length > 0 ? cookies[0].value : undefined
}

export async function deleteCookie(name: string, options?: CookieOptions) {
  return setCookie(name, '', 0, options)
}
