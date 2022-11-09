import { checkUser, sanitizeUser } from './user'
import type { User } from './user.types'

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

describe('check user function', () => {
  it('should only accept valid user objects', () => {
    const obj: any = { id: 42, name: true, email: null } // Valid, even though not sanitized
    const user: User = { id: '42', name: 'John', email: 'john@doe.com' }
    const undefUser: any = undefined
    const nullUser: any = null
    const invalidUser: any = 42

    expect(checkUser(obj)).toBe(true)
    expect(checkUser(user)).toBe(true)
    expect(checkUser(undefUser)).toBe(false)
    expect(checkUser(nullUser)).toBe(false)
    expect(checkUser(invalidUser)).toBe(false)
  })
})
