import { stubZoneJs } from '../../test/stubZoneJs'

import type { BrowserWindowWithZoneJs } from './getZoneJsOriginalValue'
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

  it("returns the original value if Zone is defined but didn't patch that method", () => {
    zoneJsStub = stubZoneJs()
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })

  it('returns the original value if Zone is defined but does not define the __symbol__ function', () => {
    zoneJsStub = stubZoneJs()
    delete (window as BrowserWindowWithZoneJs).Zone!.__symbol__
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })

  it('returns the original value if Zone did patch the method', () => {
    zoneJsStub = stubZoneJs()
    zoneJsStub.replaceProperty(object, 'name', noop)
    expect(getZoneJsOriginalValue(object, 'name')).toBe(originalValue)
  })
})
