import { now } from './performance'

describe('now', () => {
  it('returns performance.now()', () => {
    spyOn(performance, 'now').and.returnValue(1234.5)
    expect(now()).toBe(1234.5)
  })
})
