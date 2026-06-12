import { getDebugMode, setDebugMode } from './debug'

describe('debug mode', () => {
  afterEach(() => {
    setDebugMode(false)
  })

  it('is disabled by default', () => {
    expect(getDebugMode()).toBe(false)
  })

  it('reflects the value set via setDebugMode', () => {
    setDebugMode(true)
    expect(getDebugMode()).toBe(true)

    setDebugMode(false)
    expect(getDebugMode()).toBe(false)
  })
})
