import type { Subscription } from '@datadog/browser-core/src/tools/observable'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, createNewEvent } from '@datadog/browser-core/test'
import type { RumConfiguration } from '../domain/configuration'
import type { ViewportDimension } from './viewportObservable'
import { getViewportDimension, initViewportObservable } from './viewportObservable'

describe('viewportObservable', () => {
  let viewportSubscription: Subscription
  let viewportDimension: ViewportDimension
  let clock: Clock
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    viewportSubscription = initViewportObservable(configuration).subscribe((dimension) => {
      viewportDimension = dimension
    })
    clock = mockClock()
  })

  afterEach(() => {
    viewportSubscription.unsubscribe()
    clock.cleanup()
  })

  const addVerticalScrollBar = () => {
    document.body.style.setProperty('margin-bottom', '5000px')
  }
  const addHorizontalScrollBar = () => {
    document.body.style.setProperty('margin-right', '5000px')
  }

  it('should track viewport resize', () => {
    window.dispatchEvent(createNewEvent('resize'))
    clock.tick(200)

    expect(viewportDimension).toEqual({ height: jasmine.any(Number), width: jasmine.any(Number) })
  })

  describe('get layout width and height has similar native behaviour', () => {
    afterEach(() => {
      document.body.style.removeProperty('margin-bottom')
      document.body.style.removeProperty('margin-right')
    })

    // innerWidth includes the thickness of the sidebar while `visualViewport.width` and clientWidth exclude it
    it('without scrollbars', () => {
      expect(getViewportDimension()).toEqual({ height: window.innerHeight, width: window.innerWidth })
    })

    it('with scrollbars', () => {
      addHorizontalScrollBar()
      addVerticalScrollBar()
      expect([
        // Some devices don't follow specification of including scrollbars
        { width: window.innerWidth, height: window.innerHeight },
        { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      ]).toContain(getViewportDimension())
    })
  })
})
