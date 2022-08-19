import type { BuildEnvWindow } from './specHelper'
import { clearAllCookies } from './specHelper'

beforeEach(() => {
  ;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'dev'
  // reset globals
  ;(window as any).DD_LOGS = {}
  ;(window as any).DD_RUM = {}
  // prevent 'Some of your tests did a full page reload!' issue
  window.onbeforeunload = () => 'stop'
})

afterEach(() => {
  clearAllCookies()
})
