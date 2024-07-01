import type { MockZoneJs } from '../../test'
import { mockZoneJs } from '../../test'

import type { BrowserWindowWithZoneJs } from './getZoneJsOriginalValue'
import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'
import { noop } from './utils/functionUtils'

describe('getZoneJsOriginalValue', () => {
  let zoneJs: MockZoneJs | undefined

  function originalValue() {
    // just a function that does nothing but different than 'noop' as we'll want to differentiate
    // them.
  }
  const object = {
    name: originalValue,
  }

  afterEach(() => {
    zoneJs?.restore()
  })

  it('returns the original value directly if Zone is not not defined', () => {
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })

  it("returns the original value if Zone is defined but didn't patch that method", () => {
    zoneJs = mockZoneJs()
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })

  it('returns the original value if Zone is defined but does not define the __symbol__ function', () => {
    zoneJs = mockZoneJs()
    delete (window as BrowserWindowWithZoneJs).Zone!.__symbol__
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })

  it('returns the original value if Zone did patch the method', () => {
    zoneJs = mockZoneJs()
    zoneJs.replaceProperty(object, 'name', noop)
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })
})
