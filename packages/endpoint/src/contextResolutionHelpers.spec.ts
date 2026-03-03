import { describe, it } from 'node:test'
import assert from 'node:assert'
import vm from 'node:vm'
import { CONTEXT_RESOLUTION_HELPERS } from './contextResolutionHelpers.ts'

function resolve(
  value: unknown,
  env: {
    cookie?: string
    jsGlobals?: Record<string, unknown>
    domElements?: Record<
      string,
      { type?: string; textContent?: string; getAttribute?: (attr: string) => string | null }
    >
    localStorageItems?: Record<string, string>
  } = {}
): unknown {
  const sandbox: Record<string, unknown> = {
    value,
    result: undefined,
    document: {
      cookie: env.cookie ?? '',
      querySelector: (selector: string) => env.domElements?.[selector] ?? null,
    },
    localStorage: {
      getItem: (key: string) => env.localStorageItems?.[key] ?? null,
    },
    window: env.jsGlobals ?? {},
  }
  // Make window properties accessible directly (since __dd_resolveJsPath uses window.x)
  if (env.jsGlobals) {
    Object.assign(sandbox.window as object, env.jsGlobals)
  }

  const script = `${CONTEXT_RESOLUTION_HELPERS}\nresult = __dd_resolveContextValue(value);`
  vm.runInNewContext(script, sandbox)
  return sandbox.result
}

describe('CONTEXT_RESOLUTION_HELPERS', () => {
  describe('rcSerializedType: string', () => {
    it('returns the static value directly', () => {
      assert.strictEqual(resolve({ rcSerializedType: 'string', value: 'hello' }), 'hello')
    })

    it('returns undefined for unknown serializedType', () => {
      assert.strictEqual(resolve({ rcSerializedType: 'unknown' }), undefined)
    })
  })

  describe('non-object value', () => {
    it('returns primitive values as-is', () => {
      assert.strictEqual(resolve('raw'), 'raw')
      assert.strictEqual(resolve(42), 42)
    })
  })

  describe('strategy: cookie', () => {
    it('reads a cookie by name', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'user_id' },
          { cookie: 'session=abc; user_id=42; other=x' }
        ),
        '42'
      )
    })

    it('returns undefined when cookie is absent', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'missing' },
          { cookie: 'session=abc' }
        ),
        undefined
      )
    })
  })

  describe('strategy: js', () => {
    it('resolves a top-level window property', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'js', path: 'userId' },
          { jsGlobals: { userId: 'alice' } }
        ),
        'alice'
      )
    })

    it('resolves a nested window property', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'js', path: 'user.id' },
          { jsGlobals: { user: { id: 'bob' } } }
        ),
        'bob'
      )
    })

    it('returns undefined for missing path', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'js', path: 'missing.deep' }),
        undefined
      )
    })
  })

  describe('strategy: localStorage', () => {
    it('reads a localStorage item by key', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'plan' },
          { localStorageItems: { plan: 'pro' } }
        ),
        'pro'
      )
    })

    it('returns null when key is absent', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'localStorage', key: 'missing' },
          { localStorageItems: {} }
        ),
        null
      )
    })
  })

  describe('strategy: dom', () => {
    it('reads textContent from a matched element', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#plan' },
          { domElements: { '#plan': { textContent: 'enterprise', getAttribute: () => null } } }
        ),
        'enterprise'
      )
    })

    it('reads an attribute from a matched element', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#app', attribute: 'data-version' },
          {
            domElements: {
              '#app': {
                textContent: '',
                getAttribute: (attr: string) => (attr === 'data-version' ? '2.0' : null),
              },
            },
          }
        ),
        '2.0'
      )
    })

    it('returns undefined for password input (blocks all reads, not just value attribute)', () => {
      assert.strictEqual(
        resolve(
          { rcSerializedType: 'dynamic', strategy: 'dom', selector: 'input' },
          {
            domElements: {
              input: {
                getAttribute: (attr: string) => (attr === 'type' ? 'password' : null),
                textContent: 'secret',
              },
            },
          }
        ),
        undefined
      )
    })

    it('returns undefined when element not found', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'dom', selector: '#missing' }, {}),
        undefined
      )
    })
  })

  describe('extractor regex', () => {
    it('applies the extractor regex capture group to the resolved string', () => {
      assert.strictEqual(
        resolve(
          {
            rcSerializedType: 'dynamic',
            strategy: 'cookie',
            name: 'session',
            extractor: { value: 'user-(\\w+)' },
          },
          { cookie: 'session=user-alice123' }
        ),
        'alice123'
      )
    })

    it('returns full match when extractor has no capture group', () => {
      assert.strictEqual(
        resolve(
          {
            rcSerializedType: 'dynamic',
            strategy: 'cookie',
            name: 'version',
            extractor: { value: '\\d+\\.\\d+' },
          },
          { cookie: 'version=v3.14-release' }
        ),
        '3.14'
      )
    })
  })

  describe('unknown strategy', () => {
    it('returns undefined for unsupported strategy', () => {
      assert.strictEqual(
        resolve({ rcSerializedType: 'dynamic', strategy: 'unknown' }),
        undefined
      )
    })
  })
})
