import type { SessionState, SessionStore } from '@datadog/core-next'
import { getCookie, setCookie, deleteCookie } from '../../cookie'
import type { CookieOptions } from '../../cookie'

const DEFAULT_SESSION_COOKIE_NAME = '_dd_s'
const SESSION_EXPIRY_MS = 4 * 60 * 60 * 1000 // 4 hours
const DEFAULT_LOCK_NAME = 'dd_session_lock'

interface CookieStoreOptions {
  cookieOptions?: CookieOptions
  cookieName?: string
}

class CookieStore implements SessionStore {
  private readonly cookieOptions?: CookieOptions
  private readonly cookieName: string
  private readonly lockName: string

  constructor(options?: CookieStoreOptions) {
    this.cookieOptions = options?.cookieOptions
    this.cookieName = options?.cookieName || DEFAULT_SESSION_COOKIE_NAME
    this.lockName = options?.cookieName ? `dd_session_lock_${options.cookieName}` : DEFAULT_LOCK_NAME
  }

  async get(): Promise<SessionState | undefined> {
    const raw = getCookie(this.cookieName)
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
      setCookie(this.cookieName, JSON.stringify(state), SESSION_EXPIRY_MS, this.cookieOptions)
    }
    if (navigator.locks) {
      await navigator.locks.request(this.lockName, write)
    } else {
      write()
    }
  }

  async clear(): Promise<void> {
    deleteCookie(this.cookieName, this.cookieOptions)
  }

  onExternalChange(callback: () => void): () => void {
    // Use CookieStore API change event if available
    if ('cookieStore' in window) {
      const cookieStore = (window as any).cookieStore
      const handler = (event: any) => {
        const changed = event.changed || []
        const deleted = event.deleted || []
        const relevant = [...changed, ...deleted].some((cookie: any) => cookie.name === this.cookieName)
        if (relevant) {
          callback()
        }
      }
      cookieStore.addEventListener('change', handler)
      return () => cookieStore.removeEventListener('change', handler)
    }

    // Fallback: poll document.cookie
    let lastValue = getCookie(this.cookieName)
    const interval = setInterval(() => {
      const current = getCookie(this.cookieName)
      if (current !== lastValue) {
        lastValue = current
        callback()
      }
    }, 1000)
    return () => clearInterval(interval)
  }
}

export { CookieStore }
