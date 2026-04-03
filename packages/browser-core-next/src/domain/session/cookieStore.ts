import type { SessionState, SessionStore } from '@datadog/core-next'
import { getCookie, setCookie, deleteCookie } from '../../browser/cookie'
import type { CookieOptions } from '../../browser/cookie'

const SESSION_COOKIE_NAME = '_dd_s'
const SESSION_EXPIRY_MS = 4 * 60 * 60 * 1000 // 4 hours
const LOCK_NAME = 'dd_session_lock'

interface CookieStoreOptions {
  cookieOptions?: CookieOptions
}

function createCookieStore(options?: CookieStoreOptions): SessionStore {
  const cookieOptions = options?.cookieOptions

  return {
    async get() {
      const raw = getCookie(SESSION_COOKIE_NAME)
      if (!raw) {
        return undefined
      }
      try {
        return JSON.parse(raw) as SessionState
      } catch {
        return undefined
      }
    },

    async set(state: SessionState) {
      const write = () => {
        setCookie(SESSION_COOKIE_NAME, JSON.stringify(state), SESSION_EXPIRY_MS, cookieOptions)
      }
      if (navigator.locks) {
        await navigator.locks.request(LOCK_NAME, write)
      } else {
        write()
      }
    },

    async clear() {
      deleteCookie(SESSION_COOKIE_NAME, cookieOptions)
    },

    onExternalChange(callback: () => void) {
      // Use CookieStore API change event if available
      if ('cookieStore' in window) {
        const cookieStore = (window as any).cookieStore
        const handler = (event: any) => {
          const changed = event.changed || []
          const deleted = event.deleted || []
          const relevant = [...changed, ...deleted].some((cookie: any) => cookie.name === SESSION_COOKIE_NAME)
          if (relevant) {
            callback()
          }
        }
        cookieStore.addEventListener('change', handler)
        return () => cookieStore.removeEventListener('change', handler)
      }

      // Fallback: poll document.cookie
      let lastValue = getCookie(SESSION_COOKIE_NAME)
      const interval = setInterval(() => {
        const current = getCookie(SESSION_COOKIE_NAME)
        if (current !== lastValue) {
          lastValue = current
          callback()
        }
      }, 1000)
      return () => clearInterval(interval)
    },
  }
}

export { createCookieStore }
export type { CookieStoreOptions }
