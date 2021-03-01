import { createNewEvent, isIE } from '@datadog/browser-core'
import { collectAsyncCalls } from '../../../test/utils'
import {
  RecordType,
  IncrementalSource,
  MutationData,
  FullSnapshotRecord,
  RawRecord,
  IncrementalSnapshotRecord,
} from '../../types'
import { SerializedNodeWithId, NodeType } from '../rrweb-snapshot/types'
import { record } from './record'

// Each full snapshot is generating two records, a Meta record and a FullSnapshot record
const RECORDS_PER_FULL_SNAPSHOTS = 2

describe('record', () => {
  let sandbox: HTMLElement
  let input: HTMLInputElement
  let stop: (() => void) | undefined
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
    if (stop) {
      stop()
    }
  })

  it('will only have one full snapshot without checkout config', () => {
    stop = record({ emit: emitSpy }).stop

    const inputEventCount = 30
    dispatchInputEvents(inputEventCount)

    const records = getEmittedRecords()
    expect(records.length).toEqual(inputEventCount + RECORDS_PER_FULL_SNAPSHOTS)
    expect(records.filter((record) => record.type === RecordType.Meta).length).toEqual(1)
    expect(records.filter((record) => record.type === RecordType.FullSnapshot).length).toEqual(1)
  })

  it('is safe to checkout during async callbacks', (done) => {
    const recordApi = record({
      emit: emitSpy,
    })
    stop = recordApi.stop

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

    waitEmitCalls(7, () => {
      const records = getEmittedRecords()
      const sandboxNode = findNode(
        (records[1] as FullSnapshotRecord).data.node,
        (node) => node.type === NodeType.Element && node.attributes.id === 'sandbox'
      )!
      const inputId = findNode(sandboxNode, (node) => node.type === NodeType.Element && node.tagName === 'input')!.id
      const paragraphId = ((records[2] as IncrementalSnapshotRecord).data as MutationData).adds[0].node.id
      const spanId = ((records[2] as IncrementalSnapshotRecord).data as MutationData).adds[1].node.id

      expect(records[0].type).toBe(RecordType.Meta)

      expect(records[1].type).toBe(RecordType.FullSnapshot)

      expect(records[2].type).toBe(RecordType.IncrementalSnapshot)
      expect((records[2] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.Mutation,
          adds: [
            jasmine.objectContaining({
              parentId: sandboxNode.id,
              node: jasmine.objectContaining({ tagName: 'p' }),
            }),
            jasmine.objectContaining({
              parentId: paragraphId,
              node: jasmine.objectContaining({ tagName: 'span' }),
            }),
          ],
          removes: [{ parentId: sandboxNode.id, id: inputId }],
        })
      )

      expect(records[3].type).toBe(RecordType.IncrementalSnapshot)
      expect((records[3] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.Mutation,
          adds: [
            jasmine.objectContaining({
              parentId: spanId,
              node: jasmine.objectContaining({
                textContent: 'test',
              }),
            }),
          ],
          removes: [],
        })
      )

      expect(records[4].type).toBe(RecordType.Meta)

      expect(records[5].type).toBe(RecordType.FullSnapshot)

      expect(records[6].type).toBe(RecordType.IncrementalSnapshot)
      expect((records[6] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.Mutation,
          adds: [
            jasmine.objectContaining({
              parentId: sandboxNode.id,
              node: jasmine.objectContaining({
                tagName: 'span',
                id: spanId,
              }),
            }),
            jasmine.objectContaining({
              parentId: spanId,
              node: jasmine.objectContaining({
                textContent: 'test',
              }),
            }),
          ],
          removes: [{ parentId: paragraphId, id: spanId }],
        })
      )
      expectNoExtraEmitCalls(done)
    })
  })

  it('captures stylesheet rules', (done) => {
    stop = record({
      emit: emitSpy,
    }).stop

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

    waitEmitCalls(6, () => {
      const records = getEmittedRecords()

      expect(records[0].type).toEqual(RecordType.Meta)
      expect(records[1].type).toEqual(RecordType.FullSnapshot)
      expect(records[2].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[2] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({ source: IncrementalSource.Mutation })
      )
      expect(records[3].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[3] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #fff; }', index: undefined }],
        })
      )
      expect(records[4].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[4] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          removes: [{ index: 0 }],
        })
      )
      expect(records[5].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[5] as IncrementalSnapshotRecord).data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #ccc; }', index: undefined }],
        })
      )

      expectNoExtraEmitCalls(done)
    })
  })

  it('flushes pending mutation records before taking a full snapshot', (done) => {
    const recordApi = record({
      emit: emitSpy,
    })
    stop = recordApi.stop

    sandbox.appendChild(document.createElement('div'))

    recordApi.takeFullSnapshot()

    waitEmitCalls(5, () => {
      const records = getEmittedRecords()

      expect(records[0].type).toEqual(RecordType.Meta)
      expect(records[1].type).toEqual(RecordType.FullSnapshot)
      expect(records[2].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[2] as IncrementalSnapshotRecord).data.source).toEqual(IncrementalSource.Mutation)
      expect(records[3].type).toEqual(RecordType.Meta)
      expect(records[4].type).toEqual(RecordType.FullSnapshot)

      expectNoExtraEmitCalls(done)
    })
  })

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

function findNode(
  root: SerializedNodeWithId,
  predicate: (node: SerializedNodeWithId) => boolean
): SerializedNodeWithId | undefined {
  if (predicate(root)) {
    return root
  }
  if (root.type === NodeType.Document || root.type === NodeType.Element) {
    for (const child of root.childNodes) {
      const foundId = findNode(child, predicate)
      if (foundId) {
        return foundId
      }
    }
  }
}
