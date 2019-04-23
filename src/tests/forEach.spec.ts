beforeEach(() => {
  ;(navigator.sendBeacon as any) = false
})

afterEach(() => {
  // reset Datadog object
  ;(window.Datadog as any) = {}
})
