import { createNewEvent } from '../../../../../core/test/specHelper'
import type { OnClickCallback } from './listenActionEvents'
import { listenActionEvents } from './listenActionEvents'

describe('listenActionEvents', () => {
  let onClickSpy: jasmine.Spy<OnClickCallback>
  let stopListenEvents: () => void

  beforeEach(() => {
    onClickSpy = jasmine.createSpy()
    ;({ stop: stopListenEvents } = listenActionEvents({ onClick: onClickSpy }))
  })

  afterEach(() => {
    stopListenEvents()
  })

  it('listen to click events', () => {
    emulateClick()
    expect(onClickSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ type: 'click' }), false)
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
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(false)
    })

    it('click and drag to select text should reports a selection change', () => {
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(0, 3)
        },
      })
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(true)
    })

    it('click and drag that adds a selection range should reports a selection change', () => {
      // Example: Command-Click selection on Firefox
      emulateNodeSelection(0, 3)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(3, 6, { clearSelection: false })
        },
      })
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(true)
    })

    it('click to deselect previously selected text should report a selection change', () => {
      emulateNodeSelection(0, 3)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(0, 0)
        },
      })
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(true)
    })

    // eslint-disable-next-line max-len
    it('click to change the selection position (ex: last click of a triple-click selection) should report a selection change', () => {
      emulateNodeSelection(3, 4)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(0, 7)
        },
      })
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(true)
    })

    it('click that change the caret (collapsed selection) position should not report selection change', () => {
      emulateNodeSelection(0, 0)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(1, 1)
        },
      })
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(false)
    })

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

  function emulateClick({ beforeMouseUp }: { beforeMouseUp?(): void } = {}) {
    document.body.dispatchEvent(createNewEvent('mousedown'))
    beforeMouseUp?.()
    document.body.dispatchEvent(createNewEvent('mouseup'))
    document.body.dispatchEvent(createNewEvent('click'))
  }
})
