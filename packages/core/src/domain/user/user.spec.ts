import type { Context } from '../../tools/context'
import { sanitizeUser } from './user'

describe('user functions', () => {
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

  it('should keep a full copy of the user data ', () => {
    const obj = { id: 42, name: 'test', email: null, custom: { deep: true } }
    const user = sanitizeUser(obj)
    obj.custom.deep = false

    expect((user.custom as Context).deep).toEqual(true)
  })
})
