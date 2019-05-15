beforeEach(() => {
  ;(navigator.sendBeacon as any) = false
})

afterEach(() => {
  // reset globals
  ;(window.DD_LOGS as any) = {}
  ;(window.DD_RUM as any) = {}
})
