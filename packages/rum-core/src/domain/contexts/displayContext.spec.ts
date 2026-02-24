import { HookNames } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import { mockRumConfiguration } from '../../../test'
import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'
import type { DisplayContext } from './displayContext'
import { displayDecoratorFactory, startDisplayContext } from './displayContext'

describe('displayDecoratorFactory', () => {
  it('should contribute display with viewport when available', async () => {
    const factory = displayDecoratorFactory({ getViewport: () => ({ width: 1920, height: 1080 }) })
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).display.viewport).toEqual({ width: 1920, height: 1080 })
    }
  })

  it('should contribute display as undefined when viewport not yet measured', async () => {
    const factory = displayDecoratorFactory({ getViewport: () => undefined })
    const obs: Observation = { type: 'error', startTime: 0, data: {} }
    const result = await factory.create({}).decorate(obs, {})
    expect(result.status).toBe('contributed')
    if (result.status === 'contributed') {
      expect((result.attributes as any).display).toBeUndefined()
    }
  })

  it('should declare canDiscard: false', () => {
    expect(displayDecoratorFactory({ getViewport: () => undefined }).capabilities.canDiscard).toBe(false)
  })

  it('should declare name: "display"', () => {
    expect(displayDecoratorFactory({ getViewport: () => undefined }).name).toBe('display')
  })
})

describe('displayContext', () => {
  let displayContext: DisplayContext
  let requestAnimationFrameSpy: jasmine.Spy
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
    requestAnimationFrameSpy = spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
      callback(1)
      return 1
    })
  })

  afterEach(() => {
    displayContext.stop()
  })

  describe('assemble hook', () => {
    it('should set the display context', () => {
      displayContext = startDisplayContext(hooks, mockRumConfiguration())

      const event = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'view',
        startTime: 0 as RelativeTime,
      } as AssembleHookParams)
      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)

      expect(event).toEqual({
        type: 'view',
        display: {
          viewport: {
            width: jasmine.any(Number),
            height: jasmine.any(Number),
          },
        },
      })
    })
  })
})
