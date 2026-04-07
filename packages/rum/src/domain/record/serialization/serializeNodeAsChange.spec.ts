import type { TimeStamp } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import { NodePrivacyLevel } from '@datadog/browser-rum-core'
import { appendElement } from 'packages/rum-core/test'
import {
  ChangeType,
  RecordType,
  SnapshotFormat,
  type BrowserChangeRecord,
  type BrowserFullSnapshotChangeRecord,
  type BrowserRecord,
} from 'rum-events-format/session-replay-browser'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { RecordingScope } from '../recordingScope'
import type { ChangeDecoder } from './conversions'
import { createChangeDecoder } from './conversions'
import { serializeNodeAsChange } from './serializeNodeAsChange'
import type { ChangeSerializationTransaction } from './serializationTransaction'
import { SerializationKind, serializeChangesInTransaction } from './serializationTransaction'
import { createRootInsertionCursor } from './insertionCursor'

describe('serializeNodeAsChange', () => {
  let changeDecoder: ChangeDecoder
  let scope: RecordingScope

  beforeEach(() => {
    changeDecoder = createChangeDecoder()
    scope = createRecordingScopeForTesting()
  })

  describe('for <style> elements', () => {
    it('serializes the <style> element', () => {
      const record = serialize('<style id="foo"></style>')
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'STYLE', ['id', 'foo']]]])
    })

    it('serializes the contents of the associated stylesheet', () => {
      const css = 'div { color: green; }'
      const record = serialize(`<style>${css}</style>`)
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [css]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })
  })

  describe('for <style> element children', () => {
    it('does not serialize them', () => {
      const css = 'div { color: green; }'
      const record = serialize(`<style>${css}</style>`, { target: (node: Node) => node.firstChild! })
      expect(record).toBeUndefined()
    })
  })

  function serialize(
    html: string,
    { target }: { target?: (node: Node) => Node } = {}
  ): BrowserChangeRecord | BrowserFullSnapshotChangeRecord | undefined {
    const subtreeRoot = appendElement(html)
    const targetNode = target?.(subtreeRoot) ?? subtreeRoot

    let emittedRecord: BrowserRecord | undefined

    serializeChangesInTransaction(
      SerializationKind.INITIAL_FULL_SNAPSHOT,
      (record: BrowserRecord) => {
        emittedRecord = record
      },
      noop,
      scope,
      0 as TimeStamp,
      (transaction: ChangeSerializationTransaction) => {
        const insertionCursor = createRootInsertionCursor(scope.nodeIds)
        serializeNodeAsChange(insertionCursor, targetNode, NodePrivacyLevel.ALLOW, transaction)
      }
    )

    if (!emittedRecord) {
      return undefined
    }

    if (
      emittedRecord.type !== RecordType.Change &&
      (emittedRecord.type !== RecordType.FullSnapshot || emittedRecord.format !== SnapshotFormat.Change)
    ) {
      throw new Error('Expected serialization to yield a BrowserChangeRecord')
    }

    return changeDecoder.decode(emittedRecord)
  }
})
