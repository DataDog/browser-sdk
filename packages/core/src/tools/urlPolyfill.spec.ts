import { isFirefox } from '../../test/specHelper'
import { getHash, getOrigin, getPathName, getSearch, isValidUrl, normalizeUrl } from './urlPolyfill'
import { getLocationOrigin } from './utils'

describe('normalize url', () => {
  it('should add origin to relative path', () => {
    expect(normalizeUrl('/my/path')).toEqual(`${getLocationOrigin()}/my/path`)
  })

  it('should add protocol to relative url', () => {
    expect(normalizeUrl('//foo.com:9876/my/path')).toEqual('http://foo.com:9876/my/path')
  })

  it('should keep full url unchanged', () => {
    expect(normalizeUrl('https://foo.com/my/path')).toEqual('https://foo.com/my/path')
  })

  it('should keep non http url unchanged', () => {
    if (isFirefox()) {
      pending('https://bugzilla.mozilla.org/show_bug.cgi?id=1578787')
    }
    expect(normalizeUrl('file://foo.com/my/path')).toEqual('file://foo.com/my/path')
  })
})

describe('isValidUrl', () => {
  it('should ensure url is valid', () => {
    expect(isValidUrl('http://www.datadoghq.com')).toBe(true)
    expect(isValidUrl('http://www.datadoghq.com/foo/bar?a=b#hello')).toBe(true)
    expect(isValidUrl('file://www.datadoghq.com')).toBe(true)
    expect(isValidUrl('/plop')).toBe(false)
    expect(isValidUrl('')).toBe(false)
  })
})

describe('getOrigin', () => {
  it('should retrieve url origin', () => {
    expect(getOrigin('http://www.datadoghq.com')).toBe('http://www.datadoghq.com')
    expect(getOrigin('http://www.datadoghq.com/foo/bar?a=b#hello')).toBe('http://www.datadoghq.com')
    expect(getOrigin('http://localhost:8080')).toBe('http://localhost:8080')
  })
})

describe('getPathName', () => {
  it('should retrieve url path name', () => {
    expect(getPathName('http://www.datadoghq.com')).toBe('/')
    expect(getPathName('http://www.datadoghq.com/foo/bar?a=b#hello')).toBe('/foo/bar')
  })
})

describe('getSearch', () => {
  it('should retrieve url search', () => {
    expect(getSearch('http://www.datadoghq.com')).toBe('')
    expect(getSearch('http://www.datadoghq.com/foo/bar?a=b#hello')).toBe('?a=b')
  })
})

describe('getHash', () => {
  it('should retrieve url hash', () => {
    expect(getHash('http://www.datadoghq.com')).toBe('')
    expect(getHash('http://www.datadoghq.com/foo/bar?a=b#hello')).toBe('#hello')
  })
})
