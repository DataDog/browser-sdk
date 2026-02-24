import { HookNames, monitor } from '@datadog/browser-core'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import type { RumConfiguration } from '../configuration'
import type { ViewportDimension } from '../../browser/viewportObservable'
import { getViewportDimension, initViewportObservable } from '../../browser/viewportObservable'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'

export type DisplayContext = ReturnType<typeof startDisplayContext>

export function displayDecoratorFactory(deps: {
  getViewport: () => ViewportDimension | undefined
}): DecoratorFactory<Observation, { display?: any }> {
  return {
    name: 'display',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (_event, _accumulated) =>
        Promise.resolve({
          status: 'contributed' as const,
          attributes: { display: { viewport: deps.getViewport() } },
        }),
    }),
  }
}

export function startDisplayContext(hooks: Hooks, configuration: RumConfiguration) {
  let viewport: ViewportDimension | undefined
  // Use requestAnimationFrame to delay the calculation of viewport dimensions until after SDK initialization, preventing long tasks.
  const animationFrameId = requestAnimationFrame(
    monitor(() => {
      viewport = getViewportDimension()
    })
  )

  const unsubscribeViewport = initViewportObservable(configuration).subscribe((viewportDimension) => {
    viewport = viewportDimension
  }).unsubscribe

  hooks.register(
    HookNames.Assemble,
    ({ eventType }): DefaultRumEventAttributes => ({
      type: eventType,
      display: viewport ? { viewport } : undefined,
    })
  )

  return {
    stop: () => {
      unsubscribeViewport()
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    },
  }
}
