import '../index'

beforeEach(() => {
  ;(navigator.sendBeacon as any) = false
})
