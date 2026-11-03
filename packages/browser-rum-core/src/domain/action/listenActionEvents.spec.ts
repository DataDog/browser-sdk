import { createNewEvent } from '@datadog/browser-core/test'
import type { ActionEventsHooks } from './listenActionEvents'
import { ACTION_SCROLL_DISTANCE_THRESHOLD, listenActionEvents } from './listenActionEvents'

describe('listenActionEvents', () => {
  let actionEventsHooks: {
    onPointerUp: jasmine.Spy<ActionEventsHooks<object>['onPointerUp']>
    onPointerDown: jasmine.Spy<ActionEventsHooks<object>['onPointerDown']>
  }
  let stopListenEvents: () => void

  beforeEach(() => {
    actionEventsHooks = {
      onPointerUp: jasmine.createSpy(),
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

  it('listen to pointerup events', () => {
    emulateClick()
    expect(actionEventsHooks.onPointerUp).toHaveBeenCalledOnceWith(
      {},
      jasmine.objectContaining({ type: 'pointerup' }),
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
    expect(actionEventsHooks.onPointerUp).not.toHaveBeenCalled()
  })

  it('passes the context created in onPointerDown to onPointerUp', () => {
    const context = {}
    actionEventsHooks.onPointerDown.and.returnValue(context)
    emulateClick()
    expect(actionEventsHooks.onPointerUp.calls.mostRecent().args[0]).toBe(context)
  })

  it('ignore "click" events if no "pointerdown" event happened since the previous "click" event', () => {
    emulateClick()
    actionEventsHooks.onPointerUp.calls.reset()

    window.dispatchEvent(createNewEvent('click', { target: document.body }))

    expect(actionEventsHooks.onPointerUp).not.toHaveBeenCalled()
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
      return actionEventsHooks.onPointerUp.calls.mostRecent().args[2]().selection
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
      expect(hasInputUserActivity()).toBe(true)
    })

    it('input events that precede clicks should not be taken into account', () => {
      emulateInputEvent()
      emulateClick()
      expect(hasInputUserActivity()).toBe(false)
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
      return actionEventsHooks.onPointerUp.calls.mostRecent().args[2]().input
    }
  })

  describe('scroll', () => {
    it('click that do not trigger a scroll event should not report scroll user activity', () => {
      emulateClick()
      expect(hasScrollUserActivity()).toBe(false)
    })

    it('click that triggers a scroll event during the click should report a scroll user activity', () => {
      emulateClick({
        beforeMouseUp() {
          emulateScrollEvent()
        },
      })
      expect(hasScrollUserActivity()).toBe(true)
    })

    it('click that triggers a scroll event slightly after the click should report a scroll user activity', () => {
      emulateClick()
      emulateScrollEvent()
      expect(hasScrollUserActivity()).toBe(true)
    })

    it('scroll events that precede clicks should not be taken into account', () => {
      emulateScrollEvent()
      emulateClick()
      expect(hasScrollUserActivity()).toBe(false)
    })

    function emulateScrollEvent() {
      window.dispatchEvent(createNewEvent('scroll'))
    }
    function hasScrollUserActivity() {
      return actionEventsHooks.onPointerUp.calls.mostRecent().args[2]().scroll
    }
  })

  // The movement guard (see listenActionEvents) only discards a pointerdown -> pointerup pair as a
  // scroll/drag for touch/pen pointers that travel farther than ACTION_SCROLL_DISTANCE_THRESHOLD.
  // The threshold sits at/above the browser's own synthetic-`click` suppression slop (~8px in
  // Chromium), so the guard never discards a gesture the browser itself would have turned into a
  // click — protecting against regressions on touch screens (small tap jitter) while still dropping
  // scroll gestures that a WebView delivers as pointerdown -> pointerup.
  describe('scroll gesture guard', () => {
    it('does not trigger onPointerUp when a touch pointer moves beyond the scroll threshold', () => {
      emulateGesture({ pointerType: 'touch', from: { x: 100, y: 100 }, to: { x: 100, y: 260 } })
      expect(actionEventsHooks.onPointerUp).not.toHaveBeenCalled()
    })

    it('triggers onPointerUp for a touch pointer that stays within the scroll threshold', () => {
      emulateGesture({ pointerType: 'touch', from: { x: 100, y: 100 }, to: { x: 103, y: 104 } })
      expect(actionEventsHooks.onPointerUp).toHaveBeenCalledTimes(1)
    })

    it('triggers onPointerUp for a touch tap with jitter the browser still treats as a click (< slop)', () => {
      // Chromium fires its synthetic `click` for touch movement up to ~8px; the guard must keep it.
      emulateGesture({ pointerType: 'touch', from: { x: 100, y: 100 }, to: { x: 106, y: 104 } }) // ~7.2px
      expect(actionEventsHooks.onPointerUp).toHaveBeenCalledTimes(1)
    })

    it('triggers onPointerUp for a touch pointer at exactly the threshold', () => {
      emulateGesture({ pointerType: 'touch', from: { x: 100, y: 100 }, to: { x: 100, y: 100 + ACTION_SCROLL_DISTANCE_THRESHOLD } })
      expect(actionEventsHooks.onPointerUp).toHaveBeenCalledTimes(1)
    })

    it('does not trigger onPointerUp just past the threshold', () => {
      emulateGesture({ pointerType: 'touch', from: { x: 100, y: 100 }, to: { x: 100, y: 101 + ACTION_SCROLL_DISTANCE_THRESHOLD } })
      expect(actionEventsHooks.onPointerUp).not.toHaveBeenCalled()
    })

    it('uses euclidean distance for diagonal movement', () => {
      // dx=8, dy=8 -> ~11.3px, beyond the 10px threshold even though neither axis alone is.
      emulateGesture({ pointerType: 'touch', from: { x: 100, y: 100 }, to: { x: 108, y: 108 } })
      expect(actionEventsHooks.onPointerUp).not.toHaveBeenCalled()
    })

    it('applies the guard to pen pointers (a pen drag is not a click)', () => {
      emulateGesture({ pointerType: 'pen', from: { x: 100, y: 100 }, to: { x: 100, y: 260 } })
      expect(actionEventsHooks.onPointerUp).not.toHaveBeenCalled()
    })

    it('records a pen tap within the tolerance', () => {
      emulateGesture({ pointerType: 'pen', from: { x: 100, y: 100 }, to: { x: 101, y: 101 } })
      expect(actionEventsHooks.onPointerUp).toHaveBeenCalledTimes(1)
    })

    it('never discards a mouse pointer, no matter how far it moved (desktop click semantics unchanged)', () => {
      emulateGesture({ pointerType: 'mouse', from: { x: 100, y: 100 }, to: { x: 400, y: 400 } })
      expect(actionEventsHooks.onPointerUp).toHaveBeenCalledTimes(1)
    })

    it('does not trigger onPointerUp when the pointer is cancelled (pointerup never fires)', () => {
      // A scroll on a normal page fires pointercancel instead of pointerup, so onPointerUp must not
      // be called at all. The guard is irrelevant here — there is simply no pointerup.
      window.dispatchEvent(createNewEvent('pointerdown', { target: document.body, isPrimary: true, clientX: 100, clientY: 100 }))
      window.dispatchEvent(createNewEvent('pointercancel', { target: document.body, isPrimary: true, clientX: 100, clientY: 260 }))
      expect(actionEventsHooks.onPointerUp).not.toHaveBeenCalled()
    })

    function emulateGesture({
      pointerType,
      from,
      to,
    }: {
      pointerType: string
      from: { x: number; y: number }
      to: { x: number; y: number }
    }) {
      window.dispatchEvent(
        createNewEvent('pointerdown', {
          target: document.body,
          isPrimary: true,
          pointerType,
          clientX: from.x,
          clientY: from.y,
        })
      )
      window.dispatchEvent(
        createNewEvent('pointerup', {
          target: document.body,
          isPrimary: true,
          pointerType,
          clientX: to.x,
          clientY: to.y,
        })
      )
    }
  })

  function emulateClick({
    beforeMouseUp,
    target = document.body,
    clickEventIsPrimary = undefined,
  }: { beforeMouseUp?(this: void): void; target?: Node; clickEventIsPrimary?: boolean } = {}) {
    window.dispatchEvent(createNewEvent('pointerdown', { target, isPrimary: true }))
    window.dispatchEvent(createNewEvent('mousedown', { target }))
    beforeMouseUp?.()
    window.dispatchEvent(createNewEvent('pointerup', { target, isPrimary: true }))
    window.dispatchEvent(createNewEvent('mouseup', { target }))
    window.dispatchEvent(createNewEvent('click', { target, isPrimary: clickEventIsPrimary }))
  }
})
