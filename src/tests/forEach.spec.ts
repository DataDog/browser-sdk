import { clearAllCookies } from './specHelper'

beforeEach(() => {
  ;(navigator.sendBeacon as any) = false
})

afterEach(() => {
  clearAllCookies()
  // reset globals
  ;(window.DD_LOGS as any) = {}
  ;(window.DD_RUM as any) = {}
})
