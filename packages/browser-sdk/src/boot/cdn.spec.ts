import { unregisterSdk } from '@datadog/core-next'
import { getTargetGlobal, initCdn } from './cdn'

describe('getTargetGlobal', () => {
  let originalCurrentScript: PropertyDescriptor | undefined

  beforeEach(() => {
    originalCurrentScript = Object.getOwnPropertyDescriptor(document, 'currentScript')
  })

  afterEach(() => {
    if (originalCurrentScript) {
      Object.defineProperty(document, 'currentScript', originalCurrentScript)
    } else {
      // If the property wasn't own before, delete to restore prototype lookup
      delete (document as any).currentScript
    }
  })

  it('returns DD_SDK when document.currentScript is null', () => {
    Object.defineProperty(document, 'currentScript', {
      value: null,
      configurable: true,
    })

    expect(getTargetGlobal()).toBe('DD_SDK')
  })

  it('returns DD_SDK when script has no query string', () => {
    const fakeScript = document.createElement('script')
    fakeScript.src = 'https://cdn.example.com/sdk.js'
    Object.defineProperty(document, 'currentScript', {
      value: fakeScript,
      configurable: true,
    })

    expect(getTargetGlobal()).toBe('DD_SDK')
  })

  it('returns custom target from ?target=MY_SDK query string', () => {
    const fakeScript = document.createElement('script')
    fakeScript.src = 'https://cdn.example.com/sdk.js?target=MY_SDK'
    Object.defineProperty(document, 'currentScript', {
      value: fakeScript,
      configurable: true,
    })

    expect(getTargetGlobal()).toBe('MY_SDK')
  })
})

describe('initCdn', () => {
  afterEach(() => {
    delete (globalThis as any).DD_SDK
    unregisterSdk('default')
  })

  it('registers the SDK on the target global', async () => {
    initCdn({ clientToken: 'test', site: 'datadoghq.com' })
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect((globalThis as any).DD_SDK).toBeDefined()
  })
})
