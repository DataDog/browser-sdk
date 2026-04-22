import { getGlobalObject } from './globalObject'

describe('getGlobalObject', () => {
  it('returns window when globalThis is unavailable', () => {
    const globalThisDescriptor = Object.getOwnPropertyDescriptor(window, 'globalThis')

    if (!globalThisDescriptor?.configurable) {
      pending('globalThis descriptor is not configurable in this environment')
    }

    Object.defineProperty(window, 'globalThis', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    try {
      expect(getGlobalObject()).toBe(window)
    } finally {
      Object.defineProperty(window, 'globalThis', globalThisDescriptor!)
    }
  })

  it('returns window without relying on the Object.prototype fallback when globalThis is unavailable', () => {
    const globalThisDescriptor = Object.getOwnPropertyDescriptor(window, 'globalThis')

    if (!globalThisDescriptor?.configurable) {
      pending('globalThis descriptor is not configurable in this environment')
    }

    Object.defineProperty(window, 'globalThis', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    const definePropertySpy = spyOn(Object, 'defineProperty').and.callThrough()

    try {
      expect(getGlobalObject()).toBe(window)
      expect(definePropertySpy).not.toHaveBeenCalledWith(Object.prototype, '_dd_temp_', jasmine.any(Object))
    } finally {
      Object.defineProperty(window, 'globalThis', globalThisDescriptor!)
    }
  })
})
