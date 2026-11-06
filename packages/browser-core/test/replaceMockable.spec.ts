import { mockable } from '@datadog/js-core/util'
import { replaceMockable } from './replaceMockable'

describe('replaceMockable test helper', () => {
  function original() {
    return 'original'
  }

  it('throws when the same value is replaced twice in a test', () => {
    replaceMockable(original, () => 'first replacement')

    expect(() => replaceMockable(original, () => 'second replacement')).toThrowError('Mock has already been set')
    expect(mockable(original)()).toBe('first replacement')
  })
})
