import { display } from '../../tools/display'
import type { Context } from '../../tools/serialisation/context'
import type { Account } from '../account.types'
import type { User } from '../user.types'
import { checkContext } from './contextUtils'

describe('checkContext function', () => {
  it('should only accept valid objects', () => {
    spyOn(display, 'error')

    const obj: any = { id: 42, name: true, email: null } // Valid, even though not sanitized
    const user: User = { id: '42', name: 'John', email: 'john@doe.com' }
    const account: Account = { id: '42', name: 'Groupe' }
    const undefUser: any = undefined
    const nullUser: any = null
    const invalidUser: any = 42

    expect(checkContext(obj)).toBe(true)
    expect(checkContext(user as Context)).toBe(true)
    expect(checkContext(account as Context)).toBe(true)
    expect(checkContext(undefUser)).toBe(false)
    expect(checkContext(nullUser)).toBe(false)
    expect(checkContext(invalidUser)).toBe(false)
    expect(display.error).toHaveBeenCalledTimes(3)
  })
})
