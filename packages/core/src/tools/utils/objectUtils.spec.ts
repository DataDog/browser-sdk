import { simpleDiff } from './objectUtils'

fdescribe('simpleDiff', () => {
  it('should compute a diff', () => {
    expect(simpleDiff({ test: 1, test2: 'super' }, { test: 'super', test2: 'super' })).toEqual({
      test: 'super',
    })
  })

  it('should handle undefined attribute', () => {
    expect(simpleDiff({ test: 1, test2: 'super' }, { test: undefined, test2: 'super' })).toEqual({
      test: undefined,
    })
  })

  it('should handled removed attribute', () => {
    expect(simpleDiff({ test: 1, test2: 'super' }, { test2: 'super' })).toEqual({
      test: undefined,
    })
  })

  it('should handled table', () => {
    expect(simpleDiff({ test: [1] }, { test: [1] })).toEqual(undefined)
  })

  it('should handled table', () => {
    expect(simpleDiff({ test: [1, 2] }, { test: [2, 3] })).toEqual([2, 3])
  })
})
