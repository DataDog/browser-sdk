import type { RumPublicApi, RumInitConfiguration } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { nextjsPlugin, resetNextjsPlugin } from './nextjsPlugin'
import { addDurationVital } from './addDurationVital'

const routerTypes = ['app', 'pages'] as const

routerTypes.forEach((routerType) => {
  describe(`addDurationVital (router: '${routerType}')`, () => {
    beforeEach(() => {
      registerCleanupTask(() => {
        resetNextjsPlugin()
      })
    })

    it('should forward to rumPublicApi.addDurationVital after nextjsPlugin init', () => {
      const addDurationVitalSpy = jasmine.createSpy()
      const publicApi = { addDurationVital: addDurationVitalSpy } as unknown as RumPublicApi

      addDurationVital('reactComponentRender', {
        description: 'MyComponent',
        startTime: 0 as any,
        duration: 100,
      })

      expect(addDurationVitalSpy).not.toHaveBeenCalled()

      const plugin = nextjsPlugin({ router: routerType })
      plugin.onInit({ publicApi, initConfiguration: {} as RumInitConfiguration })

      expect(addDurationVitalSpy).toHaveBeenCalledTimes(1)
      expect(addDurationVitalSpy.calls.mostRecent().args[0]).toBe('reactComponentRender')
      expect(addDurationVitalSpy.calls.mostRecent().args[1].description).toBe('MyComponent')
    })

    it('should call immediately if nextjsPlugin is already initialized', () => {
      const addDurationVitalSpy = jasmine.createSpy()
      const publicApi = { addDurationVital: addDurationVitalSpy } as unknown as RumPublicApi

      const plugin = nextjsPlugin({ router: routerType })
      plugin.onInit({ publicApi, initConfiguration: {} as RumInitConfiguration })

      addDurationVital('reactComponentRender', {
        description: 'MyComponent',
        startTime: 0 as any,
        duration: 50,
      })

      expect(addDurationVitalSpy).toHaveBeenCalledTimes(1)
    })
  })
})
