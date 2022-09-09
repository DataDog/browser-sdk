import type { Clock } from '../../../../../core/test/specHelper'
import { createNewEvent, mockClock } from '../../../../../core/test/specHelper'
import type { OnClickCallback, OnPointerDownCallback } from './listenActionEvents'
import { listenActionEvents } from './listenActionEvents'

describe('listenActionEvents', () => {
  let onClickSpy: jasmine.Spy<OnClickCallback>
  let onPointerDownSpy: jasmine.Spy<OnPointerDownCallback>
  let stopListenEvents: () => void

  beforeEach(() => {
    onClickSpy = jasmine.createSpy()
    onPointerDownSpy = jasmine.createSpy().and.returnValue({ onClick: onClickSpy })
    ;({ stop: stopListenEvents } = listenActionEvents({ onPointerDown: onPointerDownSpy }))
  })

  afterEach(() => {
    stopListenEvents()
  })

  it('listen to click events', () => {
    emulateClick()
    expect(onClickSpy).toHaveBeenCalledOnceWith({
      event: jasmine.objectContaining({ type: 'click' }),
      getUserActivity: jasmine.any(Function),
    })
  })

  it('aborts click lifecycle if the pointerdown event occurs on a non-element', () => {
    emulateClick({ target: document.createTextNode('foo') })
    expect(onClickSpy).not.toHaveBeenCalled()
  })

  it('can abort click lifecycle by returning undefined from the onPointerDown callback', () => {
    onPointerDownSpy.and.returnValue(undefined)
    emulateClick()
    expect(onClickSpy).not.toHaveBeenCalled()
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
      return onClickSpy.calls.mostRecent().args[0].getUserActivity().selection
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
      clock.tick(1)
      expect(hasInputUserActivity()).toBe(true)
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
      return onClickSpy.calls.mostRecent().args[0].getUserActivity().input
    }
  })

  function emulateClick({ beforeMouseUp, target = document.body }: { beforeMouseUp?(): void; target?: Node } = {}) {
    window.dispatchEvent(createNewEvent('pointerdown', { target }))
    window.dispatchEvent(createNewEvent('mousedown', { target }))
    beforeMouseUp?.()
    window.dispatchEvent(createNewEvent('pointerup', { target }))
    window.dispatchEvent(createNewEvent('mouseup', { target }))
    window.dispatchEvent(createNewEvent('click', { target }))
  }
})
