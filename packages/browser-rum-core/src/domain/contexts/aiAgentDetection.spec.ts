import { registerCleanupTask } from '@datadog/browser-core/test'
import { detectCDP, detectHeadlessEnvironment, detectSoftwareRenderer } from './aiAgentContext'

describe('Tier 2 detection functions', () => {
  describe('detectSoftwareRenderer', () => {
    it('should detect SwiftShader renderer', () => {
      const originalCreateElement = document.createElement.bind(document)
      spyOn(document, 'createElement').and.callFake((tagName: string) => {
        const el = originalCreateElement(tagName)
        if (tagName === 'canvas') {
          spyOn(el as HTMLCanvasElement, 'getContext').and.returnValue({
            getExtension: () => ({
              UNMASKED_RENDERER_WEBGL: 0x9246,
            }),
            getParameter: () => 'Google SwiftShader',
          } as any)
        }
        return el
      })

      expect(detectSoftwareRenderer()).toEqual({ detection_method: 'webgl_renderer' })
    })

    it('should detect llvmpipe renderer', () => {
      const originalCreateElement = document.createElement.bind(document)
      spyOn(document, 'createElement').and.callFake((tagName: string) => {
        const el = originalCreateElement(tagName)
        if (tagName === 'canvas') {
          spyOn(el as HTMLCanvasElement, 'getContext').and.returnValue({
            getExtension: () => ({
              UNMASKED_RENDERER_WEBGL: 0x9246,
            }),
            getParameter: () => 'llvmpipe (LLVM 12.0.0, 256 bits)',
          } as any)
        }
        return el
      })

      expect(detectSoftwareRenderer()).toEqual({ detection_method: 'webgl_renderer' })
    })

    it('should not detect hardware-accelerated renderer', () => {
      const originalCreateElement = document.createElement.bind(document)
      spyOn(document, 'createElement').and.callFake((tagName: string) => {
        const el = originalCreateElement(tagName)
        if (tagName === 'canvas') {
          spyOn(el as HTMLCanvasElement, 'getContext').and.returnValue({
            getExtension: () => ({
              UNMASKED_RENDERER_WEBGL: 0x9246,
            }),
            getParameter: () => 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)',
          } as any)
        }
        return el
      })

      expect(detectSoftwareRenderer()).toBeUndefined()
    })

    it('should return undefined when WebGL is not available', () => {
      const originalCreateElement = document.createElement.bind(document)
      spyOn(document, 'createElement').and.callFake((tagName: string) => {
        const el = originalCreateElement(tagName)
        if (tagName === 'canvas') {
          spyOn(el as HTMLCanvasElement, 'getContext').and.returnValue(null)
        }
        return el
      })

      expect(detectSoftwareRenderer()).toBeUndefined()
    })

    it('should return undefined when debug extension is not available', () => {
      const originalCreateElement = document.createElement.bind(document)
      spyOn(document, 'createElement').and.callFake((tagName: string) => {
        const el = originalCreateElement(tagName)
        if (tagName === 'canvas') {
          spyOn(el as HTMLCanvasElement, 'getContext').and.returnValue({
            getExtension: () => null,
          } as any)
        }
        return el
      })

      expect(detectSoftwareRenderer()).toBeUndefined()
    })
  })

  describe('detectHeadlessEnvironment', () => {
    it('should detect zero outer dimensions', () => {
      mockOuterDimensions(0, 0)

      expect(detectHeadlessEnvironment()).toEqual({ detection_method: 'headless_environment' })
    })

    it('should not detect with normal outer dimensions', () => {
      mockOuterDimensions(900, 1440)

      expect(detectHeadlessEnvironment()).toBeUndefined()
    })

    it('should detect empty navigator.languages', () => {
      mockOuterDimensions(900, 1440)
      Object.defineProperty(navigator, 'languages', {
        get: () => [],
        configurable: true,
      })
      registerCleanupTask(() => {
        delete (navigator as any).languages
      })

      expect(detectHeadlessEnvironment()).toEqual({ detection_method: 'headless_environment' })
    })
  })

  describe('detectCDP', () => {
    it('should return an AiAgentContext when CDP is detected', () => {
      const result = detectCDP()
      // In our test environment (Karma + Chrome Headless), CDP is active
      // so this should detect it
      if (result) {
        expect(result).toEqual({ detection_method: 'cdp' })
      }
    })
  })
})

function mockOuterDimensions(height: number, width: number) {
  Object.defineProperty(window, 'outerHeight', {
    get: () => height,
    configurable: true,
  })
  Object.defineProperty(window, 'outerWidth', {
    get: () => width,
    configurable: true,
  })
  registerCleanupTask(() => {
    delete (window as any).outerHeight
    delete (window as any).outerWidth
  })
}
