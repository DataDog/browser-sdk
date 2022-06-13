import { Clock, createNewEvent } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import type { Subscription } from '../tools/observable'
import type { ViewportDimension } from './viewportObservable'
import { getViewportDimension, initViewportObservable } from './viewportObservable'

describe('viewportObservable', () => {
  let viewportSubscription: Subscription
  let viewportDimension: ViewportDimension
  let clock: Clock

  beforeEach(() => {
    viewportSubscription = initViewportObservable().subscribe((dimension) => {
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

    expect(viewportDimension).toEqual({ width: jasmine.any(Number), height: jasmine.any(Number) })
  })

  describe('get layout width and height has similar native behaviour', () => {
    // innerWidth includes the thickness of the sidebar while `visualViewport.width` and clientWidth exclude it
    it('without scrollbars', () => {
      expect(getViewportDimension()).toEqual({ width: window.innerWidth, height: window.innerHeight })
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
