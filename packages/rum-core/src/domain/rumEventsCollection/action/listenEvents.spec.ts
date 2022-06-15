import { createNewEvent } from '../../../../../core/test/specHelper'
import type { OnClickCallback } from './listenEvents'
import { listenEvents } from './listenEvents'

describe('listenEvents', () => {
  let onClickSpy: jasmine.Spy<OnClickCallback>
  let stopListenEvents: () => void

  beforeEach(() => {
    onClickSpy = jasmine.createSpy()
    ;({ stop: stopListenEvents } = listenEvents({ onClick: onClickSpy }))
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

    it('does not report selection change if nothing changes', () => {
      emulateClick()
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(false)
    })

    it('reports selection change if some node gets selected', () => {
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(0, 3)
        },
      })
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(true)
    })

    it('reports selection change if some node gets deselected', () => {
      emulateNodeSelection(0, 3)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(0, 0)
        },
      })
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(true)
    })

    it('does not report selection change if the selection changes but stays empty', () => {
      emulateNodeSelection(0, 0)
      emulateClick({
        beforeMouseUp() {
          emulateNodeSelection(1, 1)
        },
      })
      expect(onClickSpy.calls.mostRecent().args[1]).toBe(false)
    })

    function emulateNodeSelection(start: number, end: number) {
      const selection = document.getSelection()!
      const range = document.createRange()
      range.setStart(text, start)
      range.setEnd(text, end)
      selection.removeAllRanges()
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
