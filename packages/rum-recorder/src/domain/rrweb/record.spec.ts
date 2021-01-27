import { createNewEvent, isIE } from '@datadog/browser-core'
import { serializedNodeWithId, NodeType } from 'rrweb-snapshot'
import { collectAsyncCalls } from '../../../test/utils'
import { Record, RecordType, IncrementalSource, MutationData, FullSnapshotRecord } from '../../types'
import { record } from './record'

// Each full snapshot is generating two records, a Meta record and a FullSnapshot record
const RECORDS_PER_FULL_SNAPSHOTS = 2

describe('record', () => {
  let sandbox: HTMLElement
  let input: HTMLInputElement
  let stop: (() => void) | undefined
  let emitSpy: jasmine.Spy<(record: Record) => void>
  let waitEmitCalls: (expectedCallsCount: number, callback: () => void) => void
  let expectNoExtraEmitCalls: (done: () => void) => void

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    emitSpy = jasmine.createSpy()
    ;({ waitAsyncCalls: waitEmitCalls, expectNoExtraAsyncCall: expectNoExtraEmitCalls } = collectAsyncCalls(emitSpy))
    sandbox = document.createElement('div')
    sandbox.id = 'sandbox'
    input = document.createElement('input')
    sandbox.appendChild(input)
    document.body.appendChild(sandbox)
  })

  afterEach(() => {
    jasmine.clock().uninstall()
    sandbox.remove()
    if (stop) {
      stop()
    }
  })

  it('will only have one full snapshot without checkout config', () => {
    stop = record<Record>({ emit: emitSpy })?.stop

    const typeEventCount = 30
    type(typeEventCount)

    const records = getEmittedRecords()
    expect(records.length).toEqual(typeEventCount + RECORDS_PER_FULL_SNAPSHOTS)
    expect(records.filter((record) => record.type === RecordType.Meta).length).toEqual(1)
    expect(records.filter((record) => record.type === RecordType.FullSnapshot).length).toEqual(1)
  })

  it('can checkout full snapshot by number of records', () => {
    stop = record({
      emit: emitSpy,
      checkoutEveryNth: 10,
    })?.stop

    const typeEventCount = 30
    type(typeEventCount)

    const records = getEmittedRecords()
    expect(records.length).toBe(typeEventCount + RECORDS_PER_FULL_SNAPSHOTS * 4)
    expect(records.filter((record) => record.type === RecordType.Meta).length).toBe(4)
    expect(records.filter((record) => record.type === RecordType.FullSnapshot).length).toBe(4)
    expect(records[1].type).toBe(RecordType.FullSnapshot)
    expect(records[13].type).toBe(RecordType.FullSnapshot)
    expect(records[25].type).toBe(RecordType.FullSnapshot)
    expect(records[37].type).toBe(RecordType.FullSnapshot)
  })

  it('can checkout full snapshot by time', () => {
    jasmine.clock().install()
    jasmine.clock().mockDate()
    const checkoutDelay = 500
    stop = record<Record>({ emit: emitSpy, checkoutEveryNms: checkoutDelay })?.stop

    let typeEventCount = 30
    type(typeEventCount)
    jasmine.clock().tick(checkoutDelay)

    expect(getEmittedRecords().length).toBe(typeEventCount + RECORDS_PER_FULL_SNAPSHOTS)

    jasmine.clock().tick(1)
    typeEventCount += 1
    type(1)

    const records = getEmittedRecords()
    expect(records.length).toBe(typeEventCount + RECORDS_PER_FULL_SNAPSHOTS * 2)
    expect(records.filter((record) => record.type === RecordType.Meta).length).toBe(2)
    expect(records.filter((record) => record.type === RecordType.FullSnapshot).length).toBe(2)
    expect(records[1].type).toBe(RecordType.FullSnapshot)
    expect(records[34].type).toBe(RecordType.FullSnapshot)
  })

  it('is safe to checkout during async callbacks', (done) => {
    stop = record({
      emit: emitSpy,
      checkoutEveryNth: 2,
    })?.stop

    const p = document.createElement('p')
    const span = document.createElement('span')

    setTimeout(() => {
      sandbox.appendChild(p)
      p.appendChild(span)
      sandbox.removeChild(document.querySelector('input')!)
    }, 0)

    setTimeout(() => {
      span.innerText = 'test'
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
      const paragraphId = (records[2].data as MutationData).adds[0].node.id
      const spanId = (records[2].data as MutationData).adds[1].node.id

      expect(records[0].type).toBe(RecordType.Meta)

      expect(records[1].type).toBe(RecordType.FullSnapshot)

      expect(records[2].type).toBe(RecordType.IncrementalSnapshot)
      expect(records[2].data).toEqual(
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
      expect(records[3].data).toEqual(
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
      expect(records[6].data).toEqual(
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

  it('can add custom record', () => {
    stop = record({
      emit: emitSpy,
    })?.stop
    record.addCustomRecord('tag1', 1)
    record.addCustomRecord('tag2', {
      a: 'b',
    })
    const records = getEmittedRecords()
    expect(records[0].type).toEqual(RecordType.Meta)
    expect(records[1].type).toEqual(RecordType.FullSnapshot)
    expect(records[2].type).toEqual(RecordType.Custom)
    expect(records[2].data).toEqual({ tag: 'tag1', payload: 1 })
    expect(records[3].type).toEqual(RecordType.Custom)
    expect(records[3].data).toEqual({ tag: 'tag2', payload: { a: 'b' } })
  })

  it('captures stylesheet rules', (done) => {
    stop = record({
      emit: emitSpy,
    })?.stop

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
      expect(records[2].data).toEqual(jasmine.objectContaining({ source: IncrementalSource.Mutation }))
      expect(records[3].type).toEqual(RecordType.IncrementalSnapshot)
      expect(records[3].data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #fff; }', index: undefined }],
        })
      )
      expect(records[4].type).toEqual(RecordType.IncrementalSnapshot)
      expect(records[4].data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          removes: [{ index: 0 }],
        })
      )
      expect(records[5].type).toEqual(RecordType.IncrementalSnapshot)
      expect(records[5].data).toEqual(
        jasmine.objectContaining({
          source: IncrementalSource.StyleSheetRule,
          adds: [{ rule: 'body { color: #ccc; }', index: undefined }],
        })
      )

      expectNoExtraEmitCalls(done)
    })
  })

  function getEmittedRecords() {
    return emitSpy.calls.allArgs().map(([record]) => record)
  }

  function type(count: number) {
    for (let i = 0; i < count; i += 1) {
      input.value += 'a'
      input.dispatchEvent(createNewEvent('input', {}))
    }
  }
})

function findNode(
  root: serializedNodeWithId,
  predicate: (node: serializedNodeWithId) => boolean
): serializedNodeWithId | undefined {
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
