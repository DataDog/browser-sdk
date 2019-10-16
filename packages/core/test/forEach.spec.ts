import { clearAllCookies } from './specHelper'

beforeEach(() => {
  ;(navigator.sendBeacon as any) = false
})

afterEach(() => {
  clearAllCookies()
  // reset globals
  ;((window as any).DD_LOGS as any) = {}
  ;((window as any).DD_RUM as any) = {}
})
