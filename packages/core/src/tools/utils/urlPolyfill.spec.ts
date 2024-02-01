import { buildUrl, getPathName, isValidUrl, normalizeUrl } from './urlPolyfill'

describe('normalize url', () => {
  it('should resolve absolute paths', () => {
    expect(normalizeUrl('/my/path')).toEqual(`${location.origin}/my/path`)
  })

  it('should resolve relative paths', () => {
    history.pushState({}, '', '/foo/')
    expect(normalizeUrl('./my/path')).toEqual(`${location.origin}/foo/my/path`)
  })

  it('should add protocol to relative url', () => {
    expect(normalizeUrl('//foo.com:9876/my/path')).toEqual('http://foo.com:9876/my/path')
  })

  it('should keep full url unchanged', () => {
    expect(normalizeUrl('https://foo.com/my/path')).toEqual('https://foo.com/my/path')
  })

  it('should keep non http url unchanged', () => {
    expect(normalizeUrl('ftp://foo.com/my/path')).toEqual('ftp://foo.com/my/path')
  })

  it('should keep file url unchanged', () => {
    // On firefox, URL host is empty for file URI: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1578787'
    // In some cases, Mobile Safari also have this issue.
    // As we should follow the browser behavior, having one or the other doesn't matter too much, so
    // let's check for both.
    expect(['file:///my/path', 'file://foo.com/my/path']).toContain(normalizeUrl('file://foo.com/my/path'))
  })
})

describe('isValidUrl', () => {
  it('should ensure url is valid', () => {
    expect(isValidUrl('http://www.datadoghq.com')).toBe(true)
    expect(isValidUrl('http://www.datadoghq.com/foo/bar?a=b#hello')).toBe(true)
    expect(isValidUrl('file:///www.datadoghq.com')).toBe(true)
    expect(isValidUrl('/plop')).toBe(false)
    expect(isValidUrl('')).toBe(false)
  })

  it('should return the same result if the URL has been wrongfully overridden between calls', () => {
    expect(isValidUrl('http://www.datadoghq.com')).toBe(true)
    spyOn(window, 'URL').and.throwError('wrong URL override')
    expect(isValidUrl('http://www.datadoghq.com')).toBe(true)
  })
})

describe('getPathName', () => {
  it('should retrieve url path name', () => {
    expect(getPathName('http://www.datadoghq.com')).toBe('/')
    expect(getPathName('http://www.datadoghq.com/foo/bar?a=b#hello')).toBe('/foo/bar')
    expect(getPathName('file://foo.com/bar?a=b#hello')).toBe('/bar')
  })
})

describe('buildUrl', () => {
  it('should normalize href for absolute URLs', () => {
    expect(buildUrl('http://foo.com').href).toBe('http://foo.com/')
    expect(buildUrl('http://foo.com:8080').href).toBe('http://foo.com:8080/')
    expect(buildUrl('http://foo.com:80').href).toBe('http://foo.com/')
    expect(buildUrl('https://foo.com:443').href).toBe('https://foo.com/')

    expect(['file:///my/path', 'file://foo.com/my/path']).toContain(buildUrl('file://foo.com/my/path').href)
  })

  it('should normalize href for relative URLs', () => {
    expect(buildUrl('./bar', 'http://foo.com').href).toBe('http://foo.com/bar')
    expect(buildUrl('/bar', 'http://foo.com').href).toBe('http://foo.com/bar')

    expect(buildUrl('./bar', 'http://foo.com/foo').href).toBe('http://foo.com/bar')
    expect(buildUrl('/bar', 'http://foo.com/foo').href).toBe('http://foo.com/bar')

    expect(buildUrl('./bar', 'http://foo.com/foo/').href).toBe('http://foo.com/foo/bar')
    expect(buildUrl('/bar', 'http://foo.com/foo/').href).toBe('http://foo.com/bar')

    expect(['file:///bar', 'file://foo.com/bar']).toContain(buildUrl('./bar', 'file://foo.com/faa').href)
    expect(['file:///bar', 'file://foo.com/bar']).toContain(buildUrl('/bar', 'file://foo.com/faa').href)
  })
})
