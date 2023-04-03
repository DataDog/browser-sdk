import type { BuildEnvWindow } from './buildEnv'

beforeEach(() => {
  ;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'test'
  // reset globals
  ;(window as any).DD_LOGS = {}
  ;(window as any).DD_RUM = {}
  // prevent 'Some of your tests did a full page reload!' issue
  window.onbeforeunload = () => 'stop'
})

afterEach(() => {
  clearAllCookies()
})

function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/;samesite=strict`)
  })
}
