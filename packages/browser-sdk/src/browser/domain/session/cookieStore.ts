import type { SessionState, SessionStore } from '@datadog/core-next'
import { getCookie, setCookie, deleteCookie } from '../../cookie'
import type { CookieOptions } from '../../cookie'

const SESSION_COOKIE_NAME = '_dd_s'
const SESSION_EXPIRY_MS = 4 * 60 * 60 * 1000 // 4 hours
const LOCK_NAME = 'dd_session_lock'

class CookieStore implements SessionStore {
  private readonly cookieOptions?: CookieOptions

  constructor(cookieOptions?: CookieOptions) {
    this.cookieOptions = cookieOptions
  }

  async get(): Promise<SessionState | undefined> {
    const raw = getCookie(SESSION_COOKIE_NAME)
    if (!raw) {
      return undefined
    }
    try {
      return JSON.parse(raw) as SessionState
    } catch {
      return undefined
    }
  }

  async set(state: SessionState): Promise<void> {
    const write = () => {
      setCookie(SESSION_COOKIE_NAME, JSON.stringify(state), SESSION_EXPIRY_MS, this.cookieOptions)
    }
    if (navigator.locks) {
      await navigator.locks.request(LOCK_NAME, write)
    } else {
      write()
    }
  }

  async clear(): Promise<void> {
    deleteCookie(SESSION_COOKIE_NAME, this.cookieOptions)
  }

  onExternalChange(callback: () => void): () => void {
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
  }
}

export { CookieStore }
