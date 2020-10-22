import { clearAllCookies } from '../src/tools/specHelper'

beforeEach(() => {
  ;(navigator.sendBeacon as any) = false
  // reset globals
  ;((window as any).DD_LOGS as any) = {}
  ;((window as any).DD_RUM as any) = {}
})

afterEach(() => {
  clearAllCookies()
})
