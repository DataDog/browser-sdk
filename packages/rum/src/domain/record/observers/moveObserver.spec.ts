import { isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { SerializationContextStatus, serializeDocument } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { IncrementalSource, RecordType } from '../../../types'
import type { MousemoveCallBack } from './moveObserver'
import { initMoveObserver } from './moveObserver'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './observers.specHelper'

describe('initMoveObserver', () => {
  let mouseMoveCallbackSpy: jasmine.Spy<MousemoveCallBack>
  let stopObserver: () => void
  let configuration: RumConfiguration

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    configuration = {} as RumConfiguration
    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })

    mouseMoveCallbackSpy = jasmine.createSpy()
    stopObserver = initMoveObserver(configuration, mouseMoveCallbackSpy).stop
  })

  afterEach(() => {
    stopObserver()
  })

  it('should generate mouse move record', () => {
    const event = createNewEvent('mousemove', { clientX: 1, clientY: 2 })
    document.body.dispatchEvent(event)

    expect(mouseMoveCallbackSpy).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseMove,
        positions: [
          {
            x: 1,
            y: 2,
            id: jasmine.any(Number),
            timeOffset: 0,
          },
        ],
      },
    })
  })

  it('should generate touch move record', () => {
    const event = createNewEvent('touchmove', { changedTouches: [{ clientX: 1, clientY: 2 }] })
    document.body.dispatchEvent(event)

    expect(mouseMoveCallbackSpy).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.TouchMove,
        positions: [
          {
            x: 1,
            y: 2,
            id: jasmine.any(Number),
            timeOffset: 0,
          },
        ],
      },
    })
  })

  it('should not generate mouse move record if x/y are missing', () => {
    const mouseMove = createNewEvent('mousemove')
    document.body.dispatchEvent(mouseMove)

    expect(mouseMoveCallbackSpy).not.toHaveBeenCalled()
  })
})
