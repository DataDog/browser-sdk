import { resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import type { Clock } from '../../../../../core/test/specHelper'
import { createNewEvent, mockClock } from '../../../../../core/test/specHelper'
import type { ActionEventsHooks } from './listenActionEvents'
import { listenActionEvents } from './listenActionEvents'

describe('listenActionEvents', () => {
  let actionEventsHooks: {
    onActionStart: jasmine.Spy<ActionEventsHooks<object>['onActionStart']>
    onPointerDown: jasmine.Spy<ActionEventsHooks<object>['onPointerDown']>
  }
  let stopListenEvents: () => void

  beforeEach(() => {
    actionEventsHooks = {
      onActionStart: jasmine.createSpy(),
      onPointerDown: jasmine.createSpy().and.returnValue({}),
    }
    ;({ stop: stopListenEvents } = listenActionEvents(actionEventsHooks))
  })

  afterEach(() => {
    stopListenEvents()
  })

  it('listen to pointerdown events', () => {
    emulateClick()
    expect(actionEventsHooks.onPointerDown).toHaveBeenCalledOnceWith(jasmine.objectContaining({ type: 'pointerdown' }))
  })

  it('ignore non-primary pointerdown events', () => {
    emulateClick({
      beforeMouseUp() {
        window.dispatchEvent(createNewEvent('pointerdown', { target: document.body, isPrimary: false }))
      },
    })
    expect(actionEventsHooks.onPointerDown).toHaveBeenCalledTimes(1)
  })

  it('listen to click events', () => {
    emulateClick()
    expect(actionEventsHooks.onActionStart).toHaveBeenCalledOnceWith(
      {},
      jasmine.objectContaining({ type: 'click' }),
      jasmine.any(Function),
      jasmine.any(Function)
    )
  })

  it('listen to non-primary click events', () => {
    // This emulates a Chrome behavior where all click events are non-primary
    emulateClick({ clickEventIsPrimary: false })
    expect(actionEventsHooks.onActionStart).toHaveBeenCalledOnceWith(
      {},
      jasmine.objectContaining({ type: 'click' }),
      jasmine.any(Function),
      jasmine.any(Function)
    )
  })

  it('aborts click lifecycle if the pointerdown event occurs on a non-element', () => {
    emulateClick({ target: document.createTextNode('foo') })
    expect(actionEventsHooks.onPointerDown).not.toHaveBeenCalled()
  })

  it('can abort click lifecycle by returning undefined from the onPointerDown callback', () => {
    actionEventsHooks.onPointerDown.and.returnValue(undefined)
    emulateClick()
    expect(actionEventsHooks.onActionStart).not.toHaveBeenCalled()
  })

  it('passes the context created in onPointerDown to onActionStart', () => {
    const context = {}
    actionEventsHooks.onPointerDown.and.returnValue(context)
    emulateClick()
    expect(actionEventsHooks.onActionStart.calls.mostRecent().args[0]).toBe(context)
  })

  it('ignore "click" events if no "pointerdown" event happened since the previous "click" event', () => {
    emulateClick()
    actionEventsHooks.onActionStart.calls.reset()

    window.dispatchEvent(createNewEvent('click', { target: document.body }))

    expect(actionEventsHooks.onActionStart).not.toHaveBeenCalled()
  })

  describe('click_action_on_pointerup experimental feature', () => {
    beforeEach(() => {
      stopListenEvents()

      updateExperimentalFeatures(['click_action_on_pointerup'])
      ;({ stop: stopListenEvents } = listenActionEvents(actionEventsHooks))
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('listen to pointerup events', () => {
      emulateClick()
      expect(actionEventsHooks.onActionStart).toHaveBeenCalledOnceWith(
        {},
        jasmine.objectContaining({ type: 'pointerup' }),
        jasmine.any(Function),
        jasmine.any(Function)
      )
    })
  })

  describe('selection change', () => {
    let text: Text

    beforeEach(() => {
      text = document.createTextNode('foo bar')
      document.body.appendChild(text)
    })

    afterEach(() => {
      document.body.removeChild(text)
      document.getSelection()!.removeAllRanges()
    })

    it('click without selection impact should not report a selection change', () => {
      emulateClick()
      expect(hasSelectionChanged()).toBe(false)
    })

    it('click and drag to select text should reports a selection change', () => {
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(0, 3)
        },
      })
      expect(hasSelectionChanged()).toBe(true)
    })

    it('click and drag that adds a selection range should reports a selection change', () => {
      // Example: Command-Click selection on Firefox
      emulateNodeSelection(0, 3)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(3, 6, { clearSelection: false })
        },
      })
      expect(hasSelectionChanged()).toBe(true)
    })

    it('click to deselect previously selected text should report a selection change', () => {
      emulateNodeSelection(0, 3)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(0, 0)
        },
      })
      expect(hasSelectionChanged()).toBe(true)
    })

    it('click to change the selection position (ex: last click of a triple-click selection) should report a selection change', () => {
      emulateNodeSelection(3, 4)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(0, 7)
        },
      })
      expect(hasSelectionChanged()).toBe(true)
    })

    it('click that change the caret (collapsed selection) position should not report selection change', () => {
      emulateNodeSelection(0, 0)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(1, 1)
        },
      })
      expect(hasSelectionChanged()).toBe(false)
    })

    function hasSelectionChanged() {
      return actionEventsHooks.onActionStart.calls.mostRecent().args[2]().selection
    }

    function emulateNodeSelection(
      start: number,
      end: number,
      { clearSelection = true }: { clearSelection?: boolean } = {}
    ) {
      const selection = document.getSelection()!
      const range = document.createRange()
      range.setStart(text, start)
      range.setEnd(text, end)
      if (clearSelection) {
        selection.removeAllRanges()
      }
      selection.addRange(range)
      window.dispatchEvent(createNewEvent('selectionchange', { target: document }))
    }
  })

  describe('input user activity', () => {
    let clock: Clock

    beforeEach(() => {
      clock = mockClock()
    })

    afterEach(() => {
      clock.cleanup()
    })

    it('click that do not trigger an input input event should not report input user activity', () => {
      emulateClick()
      expect(hasInputUserActivity()).toBe(false)
    })

    it('click that triggers an input event during the click should report an input user activity', () => {
      emulateClick({
        beforeMouseUp() {
          emulateInputEvent()
        },
      })
      expect(hasInputUserActivity()).toBe(true)
    })

    it('click that triggers an input event slightly after the click should report an input user activity', () => {
      emulateClick()
      emulateInputEvent()
      clock.tick(1) // run immediate timeouts
      expect(hasInputUserActivity()).toBe(true)
    })

    describe('with fix_dead_clicks_after_input flag', () => {
      beforeEach(() => {
        stopListenEvents()

        updateExperimentalFeatures(['fix_dead_clicks_after_input'])
        ;({ stop: stopListenEvents } = listenActionEvents(actionEventsHooks))
      })

      afterEach(() => {
        resetExperimentalFeatures()
      })

      it('input events that precede clicks should not be taken into account', () => {
        emulateInputEvent()
        emulateClick()
        clock.tick(1) // run immediate timeouts
        expect(hasInputUserActivity()).toBe(false)
      })
    })

    it('click and type should report an input user activity', () => {
      emulateClick({
        beforeMouseUp() {
          emulateInputEvent()
        },
      })
      expect(hasInputUserActivity()).toBe(true)
    })

    function emulateInputEvent() {
      window.dispatchEvent(createNewEvent('input'))
    }
    function hasInputUserActivity() {
      return actionEventsHooks.onActionStart.calls.mostRecent().args[2]().input
    }
  })

  function emulateClick({
    beforeMouseUp,
    target = document.body,
    clickEventIsPrimary = undefined,
  }: { beforeMouseUp?(): void; target?: Node; clickEventIsPrimary?: boolean } = {}) {
    window.dispatchEvent(createNewEvent('pointerdown', { target, isPrimary: true }))
    window.dispatchEvent(createNewEvent('mousedown', { target }))
    beforeMouseUp?.()
    window.dispatchEvent(createNewEvent('pointerup', { target, isPrimary: true }))
    window.dispatchEvent(createNewEvent('mouseup', { target }))
    window.dispatchEvent(createNewEvent('click', { target, isPrimary: clickEventIsPrimary }))
  }
})
