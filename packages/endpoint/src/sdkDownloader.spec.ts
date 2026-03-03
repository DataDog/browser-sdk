import { describe, it, mock, beforeEach } from 'node:test'
import assert from 'node:assert'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { downloadSDK, clearSdkCache } from './sdkDownloader.ts'

// All tests should pass `version: '6.26.0'` explicitly in DownloadSDKOptions
// to avoid hitting the getDefaultVersion() path (which reads package.json)

describe('downloadSDK() caching', () => {
  function createMockResponse(data: string, statusCode = 200) {
    const response = new EventEmitter() as EventEmitter & { statusCode: number }
    response.statusCode = statusCode
    process.nextTick(() => {
      response.emit('data', data)
      response.emit('end')
    })
    return response
  }

  beforeEach(() => {
    clearSdkCache()
    mock.restoreAll()
  })

  it('caches SDK after first download', async () => {
    let callCount = 0
    mock.method(https, 'get', (_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      cb(createMockResponse('/* SDK CODE */'))
      return new EventEmitter()
    })

    const result = await downloadSDK({ variant: 'rum', version: '6.26.0' })
    assert.strictEqual(result, '/* SDK CODE */')
    assert.strictEqual(callCount, 1, 'https.get should be called once')
  })

  it('returns cached SDK on second call without network request', async () => {
    let callCount = 0
    mock.method(https, 'get', (_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      cb(createMockResponse('/* SDK CODE */'))
      return new EventEmitter()
    })

    const result1 = await downloadSDK({ variant: 'rum', version: '6.26.0' })
    const result2 = await downloadSDK({ variant: 'rum', version: '6.26.0' })
    assert.strictEqual(result1, result2, 'Same SDK code returned from cache')
    assert.strictEqual(callCount, 1, 'https.get should only be called once (cache hit on second call)')
  })

  it('caches different variants separately', async () => {
    let callCount = 0
    mock.method(https, 'get', (url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      const variant = url.includes('rum-slim') ? 'slim' : 'full'
      cb(createMockResponse(`/* SDK ${variant} */`))
      return new EventEmitter()
    })

    const rum = await downloadSDK({ variant: 'rum', version: '6.26.0' })
    const rumSlim = await downloadSDK({ variant: 'rum-slim', version: '6.26.0' })
    const rumAgain = await downloadSDK({ variant: 'rum', version: '6.26.0' })

    assert.strictEqual(rum, '/* SDK full */')
    assert.strictEqual(rumSlim, '/* SDK slim */')
    assert.strictEqual(rumAgain, '/* SDK full */')
    assert.strictEqual(callCount, 2, 'Only 2 network requests (one per variant)')
  })

  it('caches different datacenters separately', async () => {
    let callCount = 0
    mock.method(https, 'get', (url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      const dc = url.includes('eu1') ? 'eu1' : 'us1'
      cb(createMockResponse(`/* SDK ${dc} */`))
      return new EventEmitter()
    })

    const us1 = await downloadSDK({ variant: 'rum', datacenter: 'us1', version: '6.26.0' })
    const eu1 = await downloadSDK({ variant: 'rum', datacenter: 'eu1', version: '6.26.0' })
    const us1Again = await downloadSDK({ variant: 'rum', datacenter: 'us1', version: '6.26.0' })

    assert.strictEqual(us1, '/* SDK us1 */')
    assert.strictEqual(eu1, '/* SDK eu1 */')
    assert.strictEqual(us1Again, '/* SDK us1 */')
    assert.strictEqual(callCount, 2, 'Only 2 network requests (one per datacenter)')
  })

  it('cache hit is fast compared to network fetch', async () => {
    mock.method(https, 'get', (_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      cb(createMockResponse('/* SDK CODE */'))
      return new EventEmitter()
    })

    await downloadSDK({ variant: 'rum', version: '6.26.0' })

    const start = Date.now()
    await downloadSDK({ variant: 'rum', version: '6.26.0' })
    const elapsed = Date.now() - start

    assert.ok(elapsed < 5, `Cache hit should be fast (took ${elapsed}ms)`)
  })

  it('clearSdkCache empties the cache', async () => {
    let callCount = 0
    mock.method(https, 'get', (_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      cb(createMockResponse('/* SDK CODE */'))
      return new EventEmitter()
    })

    await downloadSDK({ variant: 'rum', version: '6.26.0' })
    clearSdkCache()
    await downloadSDK({ variant: 'rum', version: '6.26.0' })

    assert.strictEqual(callCount, 2, 'After cache clear, network request should be made again')
  })
})
