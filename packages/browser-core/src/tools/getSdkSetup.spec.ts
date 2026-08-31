import { getSdkSetup } from './getSdkSetup'

describe('getSdkSetup', () => {
  it('returns the setup the bundle was built for', () => {
    // Unit tests are bundled by webpack.base.ts, which defines the setup as 'cdn'. Tests that
    // need to exercise the npm code path mock this function with `replaceMockable`.
    expect(getSdkSetup()).toBe('cdn')
  })
})
