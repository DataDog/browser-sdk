import { createNewEvent, isIE } from '@datadog/browser-core'
import { collectAsyncCalls, createMutationPayloadValidator } from '../../../test/utils'
import {
  RecordType,
  IncrementalSource,
  MutationData,
  FullSnapshotRecord,
  RawRecord,
  IncrementalSnapshotRecord,
  FocusRecord,
} from '../../types'
import { NodeType } from '../rrweb-snapshot/types'
import { record } from './record'
import { RecordAPI } from './types'

// Each full snapshot is generating three records: Meta, Focus and FullSnapshot
const RECORDS_PER_FULL_SNAPSHOTS = 3

describe('record', () => {
  let sandbox: HTMLElement
  let input: HTMLInputElement
  let recordApi: RecordAPI
  let emitSpy: jasmine.Spy<(record: RawRecord) => void>
  let waitEmitCalls: (expectedCallsCount: number, callback: () => void) => void
  let expectNoExtraEmitCalls: (done: () => void) => void

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    emitSpy = jasmine.createSpy()
    ;({ waitAsyncCalls: waitEmitCalls, expectNoExtraAsyncCall: expectNoExtraEmitCalls } = collectAsyncCalls(emitSpy))
    ;({ sandbox, input } = createDOMSandbox())
  })

  afterEach(() => {
    jasmine.clock().uninstall()
    sandbox.remove()
    recordApi?.stop()
  })

  it('will only have one full snapshot without checkout config', () => {
    startRecording()

    const inputEventCount = 30
    dispatchInputEvents(inputEventCount)

    const records = getEmittedRecords()
    expect(records.length).toEqual(inputEventCount + RECORDS_PER_FULL_SNAPSHOTS)
    expect(records.filter((record) => record.type === RecordType.Meta).length).toEqual(1)
    expect(records.filter((record) => record.type === RecordType.FullSnapshot).length).toEqual(1)
  })

  it('is safe to checkout during async callbacks', (done) => {
    startRecording()

    const p = document.createElement('p')
    const span = document.createElement('span')

    setTimeout(() => {
      sandbox.appendChild(p)
      p.appendChild(span)
      sandbox.removeChild(document.querySelector('input')!)
    }, 0)

    setTimeout(() => {
      span.innerText = 'test'
      recordApi.takeFullSnapshot()
    }, 10)

    setTimeout(() => {
      p.removeChild(span)
      sandbox.appendChild(span)
    }, 10)

    waitEmitCalls(9, () => {
      const records = getEmittedRecords()
      expect(records[0].type).toBe(RecordType.Meta)
      expect(records[1].type).toBe(RecordType.Focus)

      expect(records[2].type).toBe(RecordType.FullSnapshot)

      expect(records[3].type).toBe(RecordType.IncrementalSnapshot)

      const { validate: validateMutationPayload, expectNewNode, expectInitialNode } = createMutationPayloadValidator(
        (records[2] as FullSnapshotRecord).data.node
      )

      const p = expectNewNode({ type: NodeType.Element, tagName: 'p' })
      const span = expectNewNode({ type: NodeType.Element, tagName: 'span' })
      const text = expectNewNode({ type: NodeType.Text, textContent: 'test' })
      const sandbox = expectInitialNode({ idAttribute: 'sandbox' })

      validateMutationPayload((records[3] as IncrementalSnapshotRecord).data as MutationData, {
        adds: [
          { parent: sandbox, node: p },
          { parent: p, node: span },
        ],
        removes: [{ node: expectInitialNode({ tag: 'input' }), parent: sandbox }],
      })

      expect(records[4].type).toBe(RecordType.IncrementalSnapshot)
      validateMutationPayload((records[4] as IncrementalSnapshotRecord).data as MutationData, {
        adds: [{ parent: span, node: text }],
      })

      expect(records[5].type).toBe(RecordType.Meta)
      expect(records[6].type).toBe(RecordType.Focus)

      expect(records[7].type).toBe(RecordType.FullSnapshot)

      expect(records[8].type).toBe(RecordType.IncrementalSnapshot)
      validateMutationPayload((records[8] as IncrementalSnapshotRecord).data as MutationData, {
        adds: [
          { parent: sandbox, node: span },
          { parent: span, node: text },
        ],
        removes: [{ parent: p, node: span }],
      })

      expectNoExtraEmitCalls(done)
    })
  })

  it('captures stylesheet rules', (done) => {
    startRecording()

    const styleElement = document.createElement('style')
    sandbox.appendChild(styleElement)

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

    waitEmitCalls(7, () => {
      const records = getEmittedRecords()

      expect(records[0].type).toEqual(RecordType.Meta)
      expect(records[1].type).toEqual(RecordType.Focus)
      expect(records[2].type).toEqual(RecordType.FullSnapshot)
      expect(records[3].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[3] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({ source: IncrementalSource.Mutation })
      )
      expect(records[4].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[4] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #fff; }', index: undefined }],
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
    })
  }

  function getEmittedRecords() {
    return emitSpy.calls.allArgs().map(([record]) => record)
  }

  function dispatchInputEvents(count: number) {
    for (let i = 0; i < count; i += 1) {
      input.value += 'a'
      input.dispatchEvent(createNewEvent('input', {}))
    }
  }
})

function createDOMSandbox() {
  const sandbox = document.createElement('div')
  sandbox.id = 'sandbox'
  const input = document.createElement('input')
  sandbox.appendChild(input)
  document.body.appendChild(sandbox)
  return { sandbox, input }
}
