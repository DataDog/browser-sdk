import { deleteCookie, getCookie } from '../../browser/cookie'
import { isLocalStorageAvailable, selectStore } from './selectStore'

const SESSION_COOKIE_NAME = '_dd_s'
// localStorageStore uses '_dd_s', memoryStore uses '_DD_SESSION'
const LOCAL_STORAGE_SESSION_KEY = '_dd_s'
const MEMORY_SESSION_KEY = '_DD_SESSION'

describe('isLocalStorageAvailable', () => {
  it('returns true when localStorage is accessible', () => {
    expect(isLocalStorageAvailable()).toBe(true)
  })

  it('returns false when localStorage.setItem throws', () => {
    spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError')

    expect(isLocalStorageAvailable()).toBe(false)
  })
})

describe('selectStore', () => {
  afterEach(() => {
    deleteCookie(SESSION_COOKIE_NAME)
    localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY)
    delete (globalThis as any)[MEMORY_SESSION_KEY]
  })

  it('returns the cookie store when cookies are authorized', async () => {
    // Cookies work in the Karma browser environment by default
    const store = selectStore()

    await store.set({ id: 'test', deviceId: 'dev', created: 1, lastActivity: 2 })

    expect(getCookie(SESSION_COOKIE_NAME)).toBeDefined()
    expect(localStorage.getItem(LOCAL_STORAGE_SESSION_KEY)).toBeNull()
  })

  it('passes cookieOptions through to the cookie store', async () => {
    // Verify that cookieOptions is accepted without error; domain validation
    // happens at write time via document.cookie (the value is silently ignored
    // when the domain doesn't match, so we just assert the store works).
    const store = selectStore({ cookieOptions: { secure: false } })

    await store.set({ id: 'opts-test', deviceId: 'dev', created: 1, lastActivity: 2 })

    expect(getCookie(SESSION_COOKIE_NAME)).toBeDefined()
  })

  it('returns the localStorage store when cookies are blocked', async () => {
    // Block cookies by making areCookiesAuthorized return false.
    // areCookiesAuthorized writes and reads back a test cookie; we prevent the
    // read from succeeding by intercepting document.cookie.
    const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!

    // Intercept cookie reads to make areCookiesAuthorized fail its check,
    // while still allowing our afterEach cleanup to run.
    let cookieBlocked = true
    const cookieStore: Record<string, string> = {}

    Object.defineProperty(Document.prototype, 'cookie', {
      get() {
        if (cookieBlocked) {
          return ''
        }
        return Object.entries(cookieStore)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
      },
      set(value: string) {
        if (!cookieBlocked) {
          const [pair] = value.split(';')
          const [k, v] = pair.split('=')
          if (k && v) {
            cookieStore[k.trim()] = v.trim()
          }
        }
      },
      configurable: true,
    })

    try {
      const store = selectStore()

      await store.set({ id: 'ls-test', deviceId: 'dev', created: 1, lastActivity: 2 })

      // Restore cookie access before asserting so afterEach cleanup works
      cookieBlocked = false
      Object.defineProperty(Document.prototype, 'cookie', originalDescriptor)

      expect(localStorage.getItem(LOCAL_STORAGE_SESSION_KEY)).not.toBeNull()
      expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    } finally {
      cookieBlocked = false
      Object.defineProperty(Document.prototype, 'cookie', originalDescriptor)
    }
  })

  it('returns the memory store when cookies and localStorage are both unavailable', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!

    // Block cookies
    Object.defineProperty(Document.prototype, 'cookie', {
      get: () => '',
      set: () => {},
      configurable: true,
    })

    // Block localStorage
    spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError')

    try {
      const store = selectStore()

      await store.set({ id: 'mem-test', deviceId: 'dev', created: 1, lastActivity: 2 })

      expect((globalThis as any)[MEMORY_SESSION_KEY]).toBeDefined()
      expect(localStorage.getItem(LOCAL_STORAGE_SESSION_KEY)).toBeNull()
    } finally {
      Object.defineProperty(Document.prototype, 'cookie', originalDescriptor)
    }
  })
})
