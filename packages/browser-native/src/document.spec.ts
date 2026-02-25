import { getCookie, setCookie, getReadyState, getVisibilityState } from './document'

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

describe('getReadyState', () => {
  it('returns document.readyState', () => {
    spyOnProperty(document, 'readyState', 'get').and.returnValue('complete')
    expect(getReadyState()).toBe('complete')
  })
})

describe('getVisibilityState', () => {
  it('returns document.visibilityState', () => {
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden')
    expect(getVisibilityState()).toBe('hidden')
  })
})
