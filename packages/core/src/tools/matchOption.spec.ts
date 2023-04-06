import { display } from './display'
import { matchList } from './matchOption'

describe('matchList', () => {
  it('should match exact value', () => {
    const list = ['foo', 'bar']
    expect(matchList(list, 'foo')).toBe(true)
    expect(matchList(list, 'bar')).toBe(true)
    expect(matchList(list, 'qux')).toBe(false)
  })

  it('should match regexp', () => {
    const list = [/^foo/, /foo$/]
    expect(matchList(list, 'foobar')).toBe(true)
    expect(matchList(list, 'barfoo')).toBe(true)
    expect(matchList(list, 'barqux')).toBe(false)
  })

  it('should match function', () => {
    const list = [(value: string) => value === 'foo', (value: string) => value === 'bar']
    expect(matchList(list, 'foo')).toBe(true)
    expect(matchList(list, 'bar')).toBe(true)
    expect(matchList(list, 'qux')).toBe(false)
  })

  it('should compare strings using startsWith when enabling the option', () => {
    const list = ['http://my.domain.com']
    expect(matchList(list, 'http://my.domain.com/action', true)).toBe(true)
  })

  it('should catch error from provided function', () => {
    spyOn(display, 'error')
    const list = [
      (_: string) => {
        throw new Error('oops')
      },
    ]
    expect(matchList(list, 'foo')).toBe(false)
    expect(display.error).toHaveBeenCalled()
  })
})
