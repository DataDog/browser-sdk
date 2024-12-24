import { sanitizeAccount } from './account'

describe('sanitize account function', () => {
  it('should sanitize a account object', () => {
    const obj = { id: 42, name: true }
    const account = sanitizeAccount(obj)

    expect(account).toEqual({ id: '42', name: 'true' })
  })

  it('should not mutate the original data', () => {
    const obj = { id: 42, name: 'test' }
    const account = sanitizeAccount(obj)

    expect(account.id).toEqual('42')
    expect(obj.id).toEqual(42)
  })
})
