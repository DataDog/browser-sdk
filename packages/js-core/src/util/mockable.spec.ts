import { registerCleanupTask } from '../../../browser-core/test'
import { mockable, mockableReplacements, replaceMockable } from './mockable'

describe('mockable', () => {
  function original() {
    return 'original'
  }

  function otherOriginal() {
    return 'other original'
  }

  beforeEach(() => {
    registerCleanupTask(() => {
      mockableReplacements.delete(original)
      mockableReplacements.delete(otherOriginal)
    })
  })

  it('returns the value as-is when no replacement is registered', () => {
    expect(mockable(original)).toBe(original)
  })

  it('returns the replacement registered with replaceMockable', () => {
    replaceMockable(original, () => 'replacement')

    expect(mockable(original)()).toBe('replacement')
  })

  it('uses the last replacement when the same value is replaced twice', () => {
    replaceMockable(original, () => 'first replacement')
    replaceMockable(original, () => 'second replacement')

    expect(mockable(original)()).toBe('second replacement')
  })

  it('keeps replacements of different values independent', () => {
    replaceMockable(original, () => 'replacement')

    expect(mockable(original)()).toBe('replacement')
    expect(mockable(otherOriginal)).toBe(otherOriginal)
  })
})
