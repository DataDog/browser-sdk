import {
  serializeDynamicValueToJs,
  nodeContextItemHandler,
  serializeConfigToJs,
  CodeExpression,
} from './nodeResolution'
import type { ContextItem, DynamicOption } from './remoteConfiguration.types'

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

describe('nodeContextItemHandler', () => {
  const resolve = (v: unknown): unknown => {
    if (typeof v === 'object' && v !== null && 'strategy' in v) {
      return { __isCodeExpression: true as const, code: serializeDynamicValueToJs(v as DynamicOption) }
    }
    return v
  }

  it('should convert a single ContextItem to a JS object literal CodeExpression', () => {
    const items: ContextItem[] = [
      { key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'js', path: 'window.user' } },
    ]
    const result = nodeContextItemHandler(items, resolve) as CodeExpression
    expect(result.__isCodeExpression).toBe(true)
    expect(result.code).toContain('"id"')
    expect(result.code).toContain("__dd_getJs('window.user')")
  })

  it('should handle multiple keys', () => {
    const items: ContextItem[] = [
      { key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'uid' } },
      { key: 'env', value: { rcSerializedType: 'dynamic', strategy: 'js', path: 'window.env' } },
    ]
    const result = nodeContextItemHandler(items, resolve) as CodeExpression
    expect(result.code).toContain("__dd_getCookie('uid')")
    expect(result.code).toContain("__dd_getJs('window.env')")
  })

  it('should skip items where value is undefined (malformed ContextItem)', () => {
    const items = [{ key: 'id', value: undefined as any }]
    const result = nodeContextItemHandler(items, () => undefined) as CodeExpression
    expect(result.code).toBe('{}')
  })
})

describe('serializeConfigToJs', () => {
  it('should serialize primitive values', () => {
    expect(serializeConfigToJs(24)).toBe('24')
    expect(serializeConfigToJs('hello')).toBe('"hello"')
    expect(serializeConfigToJs(true)).toBe('true')
    expect(serializeConfigToJs(null)).toBe('null')
  })

  it('should inline a CodeExpression as raw code', () => {
    const expr: CodeExpression = { __isCodeExpression: true, code: "__dd_getJs('window.user')" }
    expect(serializeConfigToJs(expr)).toBe("__dd_getJs('window.user')")
  })

  it('should serialize a plain object recursively', () => {
    const result = serializeConfigToJs({ sessionSampleRate: 24, env: 'prod' })
    expect(result).toContain('"sessionSampleRate": 24')
    expect(result).toContain('"env": "prod"')
  })

  it('should inline CodeExpression values within an object', () => {
    const config = {
      sessionSampleRate: 24,
      user: { __isCodeExpression: true as const, code: "{ id: __dd_getJs('window.user') }" },
    }
    const result = serializeConfigToJs(config)
    expect(result).toContain('"sessionSampleRate": 24')
    expect(result).toContain('"user": { id: __dd_getJs(\'window.user\') }')
  })

  it('should serialize arrays', () => {
    expect(serializeConfigToJs([1, 'two', true])).toBe('[1, "two", true]')
  })

  it('should return {} for an empty object', () => {
    expect(serializeConfigToJs({})).toBe('{}')
  })

  it('should handle a realistic full config with mixed static and dynamic values', () => {
    const config = {
      applicationId: 'd717cc88-ced7-4830-a377-14433a5c7bb0',
      sessionSampleRate: 24,
      env: 'remote_config_demo',
      user: { __isCodeExpression: true as const, code: "{ 'id': __dd_getJs('window.user') }" },
    }
    const result = serializeConfigToJs(config)
    expect(result).toContain('"applicationId": "d717cc88-ced7-4830-a377-14433a5c7bb0"')
    expect(result).toContain('"sessionSampleRate": 24')
    expect(result).toContain('"env": "remote_config_demo"')
    expect(result).toContain("\"user\": { 'id': __dd_getJs('window.user') }")
  })
})
