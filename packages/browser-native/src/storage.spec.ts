import { getCookie, setCookie } from './storage'

describe('getCookie', () => {
  it('returns document.cookie', () => {
    spyOnProperty(document, 'cookie', 'get').and.returnValue('foo=bar')
    expect(getCookie()).toBe('foo=bar')
  })
})

describe('setCookie', () => {
  it('sets document.cookie', () => {
    const spy = spyOnProperty(document, 'cookie', 'set')
    setCookie('foo=bar; path=/')
    expect(spy).toHaveBeenCalledWith('foo=bar; path=/')
  })
})
