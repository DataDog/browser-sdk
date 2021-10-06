import { isIE } from '@datadog/browser-core'
import { DefaultPrivacyLevel } from 'packages/core/src/domain/configuration'
import { Clock, createNewEvent } from '../../../../core/test/specHelper'
import { collectAsyncCalls } from '../../../test/utils'
import { RecordType, IncrementalSource, RawRecord, IncrementalSnapshotRecord, FocusRecord } from '../../types'
import { record } from './record'
import { RecordAPI } from './types'

describe('record', () => {
  let sandbox: HTMLElement
  let recordApi: RecordAPI
  let emitSpy: jasmine.Spy<(record: RawRecord) => void>
  let waitEmitCalls: (expectedCallsCount: number, callback: () => void) => void
  let expectNoExtraEmitCalls: (done: () => void) => void
  let clock: Clock | undefined

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    emitSpy = jasmine.createSpy()
    ;({ waitAsyncCalls: waitEmitCalls, expectNoExtraAsyncCall: expectNoExtraEmitCalls } = collectAsyncCalls(emitSpy))
    sandbox = createDOMSandbox()
  })

  afterEach(() => {
    clock?.cleanup()
    sandbox.remove()
    recordApi?.stop()
  })

  it('captures stylesheet rules', (done) => {
    const styleElement = document.createElement('style')
    sandbox.appendChild(styleElement)

    startRecording()

    const styleSheet = styleElement.sheet as CSSStyleSheet
    const ruleIdx0 = styleSheet.insertRule('body { background: #000; }')
    const ruleIdx1 = styleSheet.insertRule('body { background: #111; }')
    styleSheet.deleteRule(ruleIdx1)
    setTimeout(() => {
      styleSheet.insertRule('body { color: #fff; }')
    }, 0)
    setTimeout(() => {
      styleSheet.deleteRule(ruleIdx0)
    }, 5)
    setTimeout(() => {
      styleSheet.insertRule('body { color: #ccc; }')
    }, 10)

    waitEmitCalls(9, () => {
      const records = getEmittedRecords()

      expect(records[0].type).toEqual(RecordType.Meta)
      expect(records[1].type).toEqual(RecordType.Focus)
      expect(records[2].type).toEqual(RecordType.FullSnapshot)
      expect(records[3].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[3] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { background: #000; }', index: undefined }],
        })
      )
      expect(records[4].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[4] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { background: #111; }', index: undefined }],
        })
      )
      expect(records[5].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[5] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          removes: [{ index: 0 }],
        })
      )
      expect(records[6].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[6] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #fff; }', index: undefined }],
        })
      )
      expect(records[7].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[7] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          removes: [{ index: 0 }],
        })
      )
      expect(records[8].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[8] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #ccc; }', index: undefined }],
        })
      )

      expectNoExtraEmitCalls(done)
    })
  })

  it('flushes pending mutation records before taking a full snapshot', (done) => {
    startRecording()

    sandbox.appendChild(document.createElement('div'))

    recordApi.takeFullSnapshot()

    waitEmitCalls(7, () => {
      const records = getEmittedRecords()

      expect(records[0].type).toEqual(RecordType.Meta)
      expect(records[1].type).toEqual(RecordType.Focus)
      expect(records[2].type).toEqual(RecordType.FullSnapshot)
      expect(records[3].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[3] as IncrementalSnapshotRecord).data.source).toEqual(IncrementalSource.Mutation)
      expect(records[4].type).toEqual(RecordType.Meta)
      expect(records[5].type).toEqual(RecordType.Focus)
      expect(records[6].type).toEqual(RecordType.FullSnapshot)

      expectNoExtraEmitCalls(done)
    })
  })

  describe('Focus records', () => {
    let hasFocus: boolean

    beforeEach(() => {
      hasFocus = true
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => hasFocus)
    })

    it('adds an initial Focus record when starting to record', () => {
      startRecording()
      expect(getEmittedRecords()[1]).toEqual({
        type: RecordType.Focus,
        data: {
          has_focus: true,
        },
      })
    })

    it('adds a Focus record on focus', () => {
      startRecording()
      emitSpy.calls.reset()

      window.dispatchEvent(createNewEvent('focus'))
      expect(getEmittedRecords()[0].type).toBe(RecordType.Focus)
    })

    it('adds a Focus record on blur', () => {
      startRecording()
      emitSpy.calls.reset()

      window.dispatchEvent(createNewEvent('blur'))
      expect(getEmittedRecords()[0].type).toBe(RecordType.Focus)
    })

    it('adds a Focus record on when taking a full snapshot', () => {
      startRecording()
      emitSpy.calls.reset()

      recordApi.takeFullSnapshot()
      expect(getEmittedRecords()[1].type).toBe(RecordType.Focus)
    })

    it('set has_focus to true if the document has the focus', () => {
      hasFocus = true
      startRecording()
      expect((getEmittedRecords()[1] as FocusRecord).data.has_focus).toBe(true)
    })

    it("set has_focus to false if the document doesn't have the focus", () => {
      hasFocus = false
      startRecording()
      expect((getEmittedRecords()[1] as FocusRecord).data.has_focus).toBe(false)
    })
  })

  function startRecording() {
    recordApi = record({
      emit: emitSpy,
      defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
    })
  }

  function getEmittedRecords() {
    return emitSpy.calls.allArgs().map(([record]) => record)
  }
})

function createDOMSandbox() {
  const sandbox = document.createElement('div')
  sandbox.id = 'sandbox'
  document.body.appendChild(sandbox)
  return sandbox
}
