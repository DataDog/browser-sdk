import { HookNames } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { registerCleanupTask } from '../../../../core/test'
import type { RawRumLongAnimationFrameEvent } from '../../rawRumEvent.types'
import type { Observation } from '../pipeline/rumPipelineEvents'
import type { BrowserWindow } from './sourceCodeContext'
import { sourceCodeDecoratorFactory, startSourceCodeContext } from './sourceCodeContext'

describe('sourceCodeContext', () => {
  let hooks: Hooks
  let browserWindow: BrowserWindow
  const TEST_STACK = `Error: Test error
    at testFunction (http://localhost:8080/file.js:41:27)
    at HTMLButtonElement.onclick (http://localhost:8080/file-2.js:107:146)`

  const MATCHING_TEST_STACK = `Error: Another error
    at anotherFunction (http://localhost:8080/file.js:41:27)
    at HTMLButtonElement.onPointerUp (http://localhost:8080/another-file.js:107:146)`

  beforeEach(() => {
    hooks = createHooks()
    browserWindow = window as BrowserWindow
  })

  function setupBrowserWindowWithContext() {
    browserWindow.DD_SOURCE_CODE_CONTEXT = {
      [TEST_STACK]: {
        service: 'my-service',
        version: '1.0.0',
      },
    }

    registerCleanupTask(() => {
      delete browserWindow.DD_SOURCE_CODE_CONTEXT
    })
  }

  it('should add source code context matching the error stack first frame URL', () => {
    setupBrowserWindowWithContext()
    startSourceCodeContext(hooks)

    const result = hooks.triggerHook(HookNames.Assemble, {
      eventType: 'error',
      startTime: 0 as RelativeTime,
      domainContext: {},
      rawRumEvent: {
        type: 'error',
        error: {
          stack: MATCHING_TEST_STACK,
        },
      },
    } as AssembleHookParams)

    expect(result).toEqual({
      type: 'error',
      service: 'my-service',
      version: '1.0.0',
    })
  })

  it('should add source code context matching the handling_stack first frame URL', () => {
    setupBrowserWindowWithContext()
    startSourceCodeContext(hooks)

    const result = hooks.triggerHook(HookNames.Assemble, {
      eventType: 'action',
      startTime: 0 as RelativeTime,
      rawRumEvent: {
        type: 'action',
      },
      domainContext: {
        handlingStack: MATCHING_TEST_STACK,
      },
    } as AssembleHookParams)

    expect(result).toEqual({
      type: 'action',
      service: 'my-service',
      version: '1.0.0',
    })
  })

  it('should add source code context matching the LoAF first script source URL', () => {
    setupBrowserWindowWithContext()
    startSourceCodeContext(hooks)

    const result = hooks.triggerHook(HookNames.Assemble, {
      eventType: 'long_task',
      startTime: 0 as RelativeTime,
      domainContext: {},
      rawRumEvent: {
        type: 'long_task',
        long_task: {
          entry_type: 'long-animation-frame',
          scripts: [
            {
              source_url: 'http://localhost:8080/file.js',
            },
          ],
        },
      } as RawRumLongAnimationFrameEvent,
    } as AssembleHookParams)

    expect(result).toEqual({
      type: 'long_task',
      service: 'my-service',
      version: '1.0.0',
    })
  })

  it('should not add source code context matching no stack', () => {
    setupBrowserWindowWithContext()
    startSourceCodeContext(hooks)

    const result = hooks.triggerHook(HookNames.Assemble, {
      eventType: 'error',
      startTime: 0 as RelativeTime,
      domainContext: {},
      rawRumEvent: {
        type: 'error',
        error: {
          stack: `Error: Another error
                at anotherFunction (http://localhost:8080/another-file.js:41:27)`,
        },
      },
    } as AssembleHookParams)

    expect(result).toBeUndefined()
  })

  it('should support late updates to DD_SOURCE_CODE_CONTEXT', () => {
    startSourceCodeContext(hooks)

    // Add context AFTER initialization
    setupBrowserWindowWithContext()

    const result = hooks.triggerHook(HookNames.Assemble, {
      eventType: 'error',
      startTime: 0 as RelativeTime,
      domainContext: {},
      rawRumEvent: {
        type: 'error',
        error: {
          stack: TEST_STACK,
        },
      },
    } as AssembleHookParams)

    expect(result).toEqual({
      type: 'error',
      service: 'my-service',
      version: '1.0.0',
    })
  })

  it('should ignore updates to existing source code context after initialization', () => {
    setupBrowserWindowWithContext()
    startSourceCodeContext(hooks)

    // Update existing entry
    browserWindow.DD_SOURCE_CODE_CONTEXT![TEST_STACK] = {
      service: 'updated-service',
      version: '1.1.0',
    }

    const result = hooks.triggerHook(HookNames.Assemble, {
      eventType: 'error',
      startTime: 0 as RelativeTime,
      domainContext: {},
      rawRumEvent: {
        type: 'error',
        error: {
          stack: TEST_STACK,
        },
      },
    } as AssembleHookParams)

    expect(result).toEqual({
      type: 'error',
      service: 'my-service',
      version: '1.0.0',
    })
  })
})

describe('sourceCodeDecoratorFactory', () => {
  it('should contribute service and version when context found', async () => {
    const factory = sourceCodeDecoratorFactory({
      findContext: () => ({ service: 'my-service', version: '1.0.0' }),
    })
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).service).toBe('my-service')
      expect((result.attributes as any).version).toBe('1.0.0')
    }
  })

  it('should skip when no context found', async () => {
    const factory = sourceCodeDecoratorFactory({ findContext: () => undefined })
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('skipped')
  })

  it('should declare name: "sourceCode"', () => {
    expect(sourceCodeDecoratorFactory({ findContext: () => undefined }).name).toBe('sourceCode')
  })

  it('should declare canDiscard: false', () => {
    expect(sourceCodeDecoratorFactory({ findContext: () => undefined }).capabilities.canDiscard).toBe(false)
  })
})
