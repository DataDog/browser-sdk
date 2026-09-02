import { createHook } from '@datadog/js-core/assembly'
import type { RumPlugin } from '@datadog/browser-rum-core'
import type { LogsPlugin } from '@datadog/browser-logs'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { getLoadedWasmModules, resetWasmModuleRegistryForTesting } from './wasmModuleTracking'
import { makeWasmPlugin } from './index'

describe('makeWasmPlugin', () => {
  let plugin: ReturnType<typeof makeWasmPlugin>

  beforeEach(() => {
    registerCleanupTask(resetWasmModuleRegistryForTesting)
    plugin = makeWasmPlugin()
  })

  it('is named "wasm"', () => {
    expect(plugin.name).toBe('wasm')
  })

  it('can be registered as both a RUM and a Logs plugin', () => {
    // Compile-time check: the plugin satisfies both interfaces.
    const asRum: RumPlugin = plugin
    const asLogs: LogsPlugin = plugin
    expect(asRum.name).toBe('wasm')
    expect(asLogs.name).toBe('wasm')
  })

  describe('assemble hook', () => {
    type Assemble = ReturnType<typeof createHook<any, any>>

    function registerPluginAssemble(): Assemble {
      const assemble = createHook<any, any>()
      plugin.onInit!({ hooks: { assemble } } as any)
      return assemble
    }

    it('enriches RUM error events whose stack contains a WebAssembly frame', () => {
      const assemble = registerPluginAssemble()

      const result = assemble.trigger({
        eventType: 'error',
        rawRumEvent: {
          type: 'error',
          error: {
            stack: 'RuntimeError: unreachable\n  at foo (wasm://wasm/abc123:wasm-function[42]:0x10)',
          },
        },
      })

      expect(result).toEqual({
        error: {
          source_type: 'browser+wasm',
          wasm_modules: getLoadedWasmModules(),
        },
      })
    })

    it('enriches Logs error events whose stack contains a WebAssembly frame', () => {
      const assemble = registerPluginAssemble()

      const result = assemble.trigger({
        startTime: 0,
        rawLogsEvent: {
          error: {
            stack: 'RuntimeError: unreachable\n  at foo @ https://example.com/app.wasm:wasm-function[42]:0x10',
          },
        },
      })

      expect(result).toEqual({
        error: {
          source_type: 'browser+wasm',
          wasm_modules: getLoadedWasmModules(),
        },
      })
    })

    it('skips non-WebAssembly RUM errors', () => {
      const assemble = registerPluginAssemble()

      const result = assemble.trigger({
        eventType: 'error',
        rawRumEvent: {
          type: 'error',
          error: { stack: 'Error: boom\n  at foo @ https://example.com/app.js:1:1' },
        },
      })

      expect(result).toBeUndefined()
    })

    it('skips RUM events without an error field', () => {
      const assemble = registerPluginAssemble()

      const result = assemble.trigger({
        eventType: 'view',
        rawRumEvent: { type: 'view', view: { id: 'view-id' } },
      })

      expect(result).toBeUndefined()
    })

    it('detects a WebAssembly frame in an error cause', () => {
      const assemble = registerPluginAssemble()

      const result = assemble.trigger({
        startTime: 0,
        rawLogsEvent: {
          error: {
            stack: 'Error: wrapper\n  at wrap @ https://example.com/app.js:1:1',
            causes: [{ stack: 'RuntimeError: unreachable\n  at wasm-function[3] @ [wasm code]' }],
          },
        },
      })

      expect(result).toEqual({
        error: {
          source_type: 'browser+wasm',
          wasm_modules: getLoadedWasmModules(),
        },
      })
    })
  })
})
