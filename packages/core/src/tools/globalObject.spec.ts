import { getGlobalObject } from './globalObject'

describe('getGlobalObject', () => {
  it('returns self when globalThis is unavailable', () => {
    const globalThisDescriptor = Object.getOwnPropertyDescriptor(window, 'globalThis')
    const selfDescriptor = Object.getOwnPropertyDescriptor(window, 'self')

    if (!globalThisDescriptor?.configurable) {
      pending('globalThis descriptor is not configurable in this environment')
    }
    if (!selfDescriptor?.configurable) {
      pending('self descriptor is not configurable in this environment')
    }

    const fakeSelf = { dd: 'sandbox-global' }

    Object.defineProperty(window, 'globalThis', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(window, 'self', {
      value: fakeSelf,
      configurable: true,
      writable: true,
    })

    try {
      expect(getGlobalObject()).toBe(fakeSelf)
    } finally {
      Object.defineProperty(window, 'globalThis', globalThisDescriptor!)
      Object.defineProperty(window, 'self', selfDescriptor!)
    }
  })

  it('returns self without relying on the Object.prototype fallback when globalThis is unavailable', () => {
    const globalThisDescriptor = Object.getOwnPropertyDescriptor(window, 'globalThis')
    const selfDescriptor = Object.getOwnPropertyDescriptor(window, 'self')

    if (!globalThisDescriptor?.configurable) {
      pending('globalThis descriptor is not configurable in this environment')
    }
    if (!selfDescriptor?.configurable) {
      pending('self descriptor is not configurable in this environment')
    }

    const fakeSelf = { dd: 'sandbox-global' }

    Object.defineProperty(window, 'globalThis', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(window, 'self', {
      value: fakeSelf,
      configurable: true,
      writable: true,
    })

    const definePropertySpy = spyOn(Object, 'defineProperty').and.callThrough()

    try {
      expect(getGlobalObject()).toBe(fakeSelf)
      expect(definePropertySpy).not.toHaveBeenCalledWith(Object.prototype, '_dd_temp_', jasmine.any(Object))
    } finally {
      Object.defineProperty(window, 'globalThis', globalThisDescriptor!)
      Object.defineProperty(window, 'self', selfDescriptor!)
    }
  })
})
