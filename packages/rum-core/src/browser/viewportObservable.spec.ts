import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Subscription } from '@datadog/browser-core/src/tools/observable'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../test'
import type { ViewportDimension } from './viewportObservable'
import { getViewportDimension, initViewportObservable } from './viewportObservable'

describe('viewportObservable', () => {
  let viewportSubscription: Subscription
  let viewportDimension: ViewportDimension
  let clock: Clock
  const configuration = mockRumConfiguration()

  beforeEach(() => {
    viewportSubscription = initViewportObservable(configuration).subscribe((dimension) => {
      viewportDimension = dimension
    })
    clock = mockClock()
  })

  afterEach(() => {
    viewportSubscription.unsubscribe()
  })

  it('should track viewport resize', () => {
    window.dispatchEvent(createNewEvent('resize'))
    clock.tick(200)

    expect(viewportDimension).toEqual({ width: expect.any(Number), height: expect.any(Number) })
  })

  describe('get layout width and height has similar native behaviour', () => {
    // innerWidth includes the thickness of the sidebar while `visualViewport.width` and clientWidth exclude it
    it('without scrollbars', () => {
      expect(getViewportDimension()).toEqual({ width: window.innerWidth, height: window.innerHeight })
    })

    it('with scrollbars', () => {
      // Add scrollbars
      document.body.style.setProperty('margin-bottom', '5000px')
      document.body.style.setProperty('margin-right', '5000px')
      registerCleanupTask(() => {
        document.body.style.removeProperty('margin-bottom')
        document.body.style.removeProperty('margin-right')
      })

      expect([
        // Some devices don't follow specification of including scrollbars
        { width: window.innerWidth, height: window.innerHeight },
        { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      ]).toContainEqual(getViewportDimension())
    })
  })
})
