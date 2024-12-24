import { sanitizeUser, generateAnonymousId } from './user'

describe('sanitize user function', () => {
  it('should sanitize a user object', () => {
    const obj = { id: 42, name: true, email: null }
    const user = sanitizeUser(obj)

    expect(user).toEqual({ id: '42', name: 'true', email: 'null' })
  })

  it('should not mutate the original data', () => {
    const obj = { id: 42, name: 'test', email: null }
    const user = sanitizeUser(obj)

    expect(user.id).toEqual('42')
    expect(obj.id).toEqual(42)
  })
})

describe('check anonymous id storage functions', () => {
  it('should generate a random anonymous id', () => {
    expect(generateAnonymousId()).toMatch(/^[a-z0-9]+$/)
  })
})
