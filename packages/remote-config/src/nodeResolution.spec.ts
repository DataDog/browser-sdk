import { serializeDynamicValueToJs } from './nodeResolution'

describe('serializeDynamicValueToJs', () => {
  it('should serialize cookie strategy', () => {
    const result = serializeDynamicValueToJs({
      rcSerializedType: 'dynamic',
      strategy: 'cookie',
      name: 'user_id',
    })
    expect(result).toBe("__dd_getCookie('user_id')")
  })

  it('should serialize js strategy', () => {
    const result = serializeDynamicValueToJs({
      rcSerializedType: 'dynamic',
      strategy: 'js',
      path: 'window.user',
    })
    expect(result).toBe("__dd_getJs('window.user')")
  })

  it('should serialize dom strategy (text content)', () => {
    const result = serializeDynamicValueToJs({
      rcSerializedType: 'dynamic',
      strategy: 'dom',
      selector: '[data-env]',
    })
    expect(result).toBe("__dd_getDomText('[data-env]')")
  })

  it('should serialize dom strategy (attribute)', () => {
    const result = serializeDynamicValueToJs({
      rcSerializedType: 'dynamic',
      strategy: 'dom',
      selector: '[data-env]',
      attribute: 'data-env',
    })
    expect(result).toBe("__dd_getDomAttr('[data-env]','data-env')")
  })

  it('should serialize localStorage strategy', () => {
    const result = serializeDynamicValueToJs({
      rcSerializedType: 'dynamic',
      strategy: 'localStorage',
      key: 'app_version',
    })
    expect(result).toBe("__dd_getLocalStorage('app_version')")
  })

  it('should wrap expression with extractor when present', () => {
    const result = serializeDynamicValueToJs({
      rcSerializedType: 'dynamic',
      strategy: 'cookie',
      name: 'version_string',
      extractor: { rcSerializedType: 'regex', value: 'v(\\d+)' },
    })
    expect(result).toBe("__dd_extract(__dd_getCookie('version_string'),'v(\\\\d+)')")
  })

  it('should escape special characters in string values', () => {
    const result = serializeDynamicValueToJs({
      rcSerializedType: 'dynamic',
      strategy: 'cookie',
      name: 'foo\nbar\u2028baz',
    })
    expect(result).toBe("__dd_getCookie('foo\\nbar\\u2028baz')")
  })

  it('should return "undefined" literal for unknown strategy', () => {
    const result = serializeDynamicValueToJs({
      rcSerializedType: 'dynamic',
      strategy: 'unknown' as any,
      name: 'foo',
    } as any)
    expect(result).toBe('undefined')
  })
})
