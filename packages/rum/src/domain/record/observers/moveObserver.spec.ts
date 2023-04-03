import { isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import { SerializationContextStatus, serializeDocument } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { IncrementalSource } from '../../../types'
import type { MousemoveCallBack } from './moveObserver'
import { initMoveObserver } from './moveObserver'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './observers.specHelper'

describe('initMoveObserver', () => {
  let mouseMoveCallbackSpy: jasmine.Spy<MousemoveCallBack>
  let stopObserver: () => void

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })

    mouseMoveCallbackSpy = jasmine.createSpy()
    stopObserver = initMoveObserver(mouseMoveCallbackSpy)
  })

  afterEach(() => {
    stopObserver()
  })

  it('should generate mouse move record', () => {
    const event = createNewEvent('mousemove', { clientX: 1, clientY: 2 })
    document.body.dispatchEvent(event)

    expect(mouseMoveCallbackSpy).toHaveBeenCalledWith(
      [
        {
          x: 1,
          y: 2,
          id: jasmine.any(Number),
          timeOffset: 0,
        },
      ],
      IncrementalSource.MouseMove
    )
  })

  it('should generate touch move record', () => {
    const event = createNewEvent('touchmove', { changedTouches: [{ clientX: 1, clientY: 2 }] })
    document.body.dispatchEvent(event)

    expect(mouseMoveCallbackSpy).toHaveBeenCalledWith(
      [
        {
          x: 1,
          y: 2,
          id: jasmine.any(Number),
          timeOffset: 0,
        },
      ],
      IncrementalSource.TouchMove
    )
  })

  it('should not generate mouse move record if x/y are missing', () => {
    const mouseMove = createNewEvent('mousemove')
    document.body.dispatchEvent(mouseMove)

    expect(mouseMoveCallbackSpy).not.toHaveBeenCalled()
  })
})
