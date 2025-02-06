import { generateAnonymousId } from './user'

describe('check anonymous id storage functions', () => {
  it('should generate a random anonymous id', () => {
    expect(generateAnonymousId()).toMatch(/^[a-z0-9]+$/)
  })
})
