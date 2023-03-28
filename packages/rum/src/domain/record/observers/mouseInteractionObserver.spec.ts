import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test/specHelper'
import { IncrementalSource, MouseInteractionType, RecordType } from '../../../types'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from '../../../../test/utils'
import type { MouseInteractionCallBack } from './mouseInteractionObserver'
import { initMouseInteractionObserver } from './mouseInteractionObserver'
import type { RecordIds } from './recordIds'
import { initRecordIds } from './recordIds'

describe('initMouseInteractionObserver', () => {
  let mouseInteractionCallbackSpy: jasmine.Spy<MouseInteractionCallBack>
  let stopObserver: () => void
  let recordIds: RecordIds
  let sandbox: HTMLDivElement
  let a: HTMLAnchorElement

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    sandbox = document.createElement('div')
    a = document.createElement('a')
    a.setAttribute('tabindex', '0') // make the element focusable
    sandbox.appendChild(a)
    document.body.appendChild(sandbox)
    a.focus()

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })

    mouseInteractionCallbackSpy = jasmine.createSpy()
    recordIds = initRecordIds()
    stopObserver = initMouseInteractionObserver(mouseInteractionCallbackSpy, DefaultPrivacyLevel.ALLOW, recordIds)
  })

  afterEach(() => {
    sandbox.remove()
    stopObserver()
  })

  it('should generate click record', () => {
    a.click()

    expect(mouseInteractionCallbackSpy).toHaveBeenCalledWith({
      id: jasmine.any(Number),
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.Click,
        id: jasmine.any(Number),
        x: jasmine.any(Number),
        y: jasmine.any(Number),
      },
    })
  })

  it('should generate mouseup record on pointerup DOM event', () => {
    const pointerupEvent = createNewEvent('pointerup', { clientX: 1, clientY: 2 })
    a.dispatchEvent(pointerupEvent)

    expect(mouseInteractionCallbackSpy).toHaveBeenCalledWith({
      id: recordIds.getIdForEvent(pointerupEvent),
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.MouseUp,
        id: jasmine.any(Number),
        x: jasmine.any(Number),
        y: jasmine.any(Number),
      },
    })
  })

  it('should not generate click record if x/y are missing', () => {
    const clickEvent = createNewEvent('click')
    a.dispatchEvent(clickEvent)

    expect(mouseInteractionCallbackSpy).not.toHaveBeenCalled()
  })

  it('should generate blur record', () => {
    a.blur()

    expect(mouseInteractionCallbackSpy).toHaveBeenCalledWith({
      id: jasmine.any(Number),
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.Blur,
        id: jasmine.any(Number),
      },
    })
  })

  // related to safari issue, see RUMF-1450
  describe('forced layout issue', () => {
    let coordinatesComputed: boolean

    beforeEach(() => {
      if (!window.visualViewport) {
        pending('no visualViewport')
      }

      coordinatesComputed = false
      Object.defineProperty(window.visualViewport, 'offsetTop', {
        get() {
          coordinatesComputed = true
          return 0
        },
        configurable: true,
      })
    })

    afterEach(() => {
      delete (window.visualViewport as any).offsetTop
    })

    it('should compute x/y coordinates for click record', () => {
      a.click()
      expect(coordinatesComputed).toBeTrue()
    })

    it('should not compute x/y coordinates for blur record', () => {
      a.blur()
      expect(coordinatesComputed).toBeFalse()
    })
  })
})
