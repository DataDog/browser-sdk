import { round } from './numberUtils'

describe('numberUtils', () => {
  it('should round', () => {
    expect(round(10.12591, 0)).toEqual(10)
    expect(round(10.12591, 1)).toEqual(10.1)
    expect(round(10.12591, 2)).toEqual(10.13)
    expect(round(10.12591, 3)).toEqual(10.126)
  })
})
