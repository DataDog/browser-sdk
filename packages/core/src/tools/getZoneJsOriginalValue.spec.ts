import { stubZoneJs } from '../../test/specHelper'

import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'
import { noop } from './utils'

describe('getZoneJsOriginalValue', () => {
  let zoneJsStub: ReturnType<typeof stubZoneJs> | undefined

  function originalValue() {
    // just a function that does nothing but different than 'noop' as we'll want to differentiate
    // them.
  }
  const object = {
    name: originalValue,
  }

  afterEach(() => {
    zoneJsStub?.restore()
  })

  it('returns the original value directly if Zone is not not defined', () => {
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })

  it("returns undefined if Zone is defined but didn't patch that method", () => {
    zoneJsStub = stubZoneJs()
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })

  it('returns the original value if Zone did patch the method', () => {
    zoneJsStub = stubZoneJs()
    zoneJsStub.replaceProperty(object, 'name', noop)
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })
})
