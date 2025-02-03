import { display } from '../../tools/display'
import { checkUser, generateAnonymousId } from './user'
import type { User } from './user.types'

describe('check user function', () => {
  it('should only accept valid user objects', () => {
    spyOn(display, 'error')

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
    expect(display.error).toHaveBeenCalledTimes(3)
  })
})

describe('check anonymous id storage functions', () => {
  it('should generate a random anonymous id', () => {
    expect(generateAnonymousId()).toMatch(/^[a-z0-9]+$/)
  })
})
