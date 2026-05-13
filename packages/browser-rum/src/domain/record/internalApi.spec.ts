<<<<<<< HEAD
import type { BrowserChangeRecord, BrowserFullSnapshotChangeRecord, BrowserRecord } from '../../types'
import { ChangeType, RecordType, SnapshotFormat } from '../../types'
=======
import { describe, expect, it } from 'vitest'
<<<<<<< HEAD
import { NodeType, RecordType, SnapshotFormat } from '../../types'
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
=======
import type { BrowserChangeRecord, BrowserFullSnapshotChangeRecord, BrowserRecord } from '../../types'
import { ChangeType, RecordType, SnapshotFormat } from '../../types'
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
import { appendElement } from '../../../../rum-core/test'
import { takeFullSnapshot, takeNodeSnapshot } from './internalApi'
import { createChangeDecoder } from './serialization'

describe('takeFullSnapshot', () => {
  it('should produce Meta, Focus, and FullSnapshot records', () => {
    expect(takeFullSnapshot()).toEqual(
      expect.arrayContaining([
        {
          data: {
            height: expect.any(Number),
            href: window.location.href,
            width: expect.any(Number),
          },
          type: RecordType.Meta,
          timestamp: expect.any(Number),
        },
        {
          data: {
            has_focus: document.hasFocus(),
          },
          type: RecordType.Focus,
          timestamp: expect.any(Number),
        },
        {
<<<<<<< HEAD
<<<<<<< HEAD
          data: jasmine.any(Object),
          format: SnapshotFormat.Change,
=======
          data: {
            node: expect.any(Object),
            initialOffset: {
              left: expect.any(Number),
              top: expect.any(Number),
            },
          },
          format: SnapshotFormat.V1,
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
=======
          data: expect.any(Object),
          format: SnapshotFormat.Change,
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
          type: RecordType.FullSnapshot,
          timestamp: expect.any(Number),
        },
      ])
    )
  })

  it('should produce VisualViewport records when supported', (ctx) => {
    if (!window.visualViewport) {
      ctx.skip()
      return
    }

    expect(takeFullSnapshot()).toEqual(
      expect.arrayContaining([
        {
          data: expect.any(Object),
          type: RecordType.VisualViewport,
          timestamp: expect.any(Number),
        },
      ])
    )
  })
})

describe('takeNodeSnapshot', () => {
  function decodeSnapshot(
    record: BrowserRecord | undefined
  ): BrowserChangeRecord | BrowserFullSnapshotChangeRecord | undefined {
    if (!record) {
      return undefined
    }
    if (record.type !== RecordType.FullSnapshot) {
      throw new Error(`Unexpected record type ${record.type}`)
    }
    if (record.format !== SnapshotFormat.Change) {
      throw new Error(`Unexpected record format ${record.format}`)
    }

    const decoder = createChangeDecoder()
    return decoder.decode(record)
  }

  it('should serialize nodes', () => {
    const node = appendElement('<div>Hello <b>world</b></div>', document.body)
    expect(decodeSnapshot(takeNodeSnapshot(node))).toEqual({
      type: RecordType.FullSnapshot,
      format: SnapshotFormat.Change,
      data: [[ChangeType.AddNode, [null, 'DIV'], [1, '#text', 'Hello '], [0, 'B'], [1, '#text', 'world']]],
<<<<<<< HEAD
      timestamp: jasmine.any(Number),
=======
      timestamp: expect.any(Number),
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
    })
  })

  it('should serialize shadow hosts', () => {
    const node = appendElement('<div>Hello</div>', document.body)
    const shadowRoot = node.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(document.createTextNode('world'))
    expect(decodeSnapshot(takeNodeSnapshot(node))).toEqual({
      type: RecordType.FullSnapshot,
      format: SnapshotFormat.Change,
      data: [[ChangeType.AddNode, [null, 'DIV'], [1, '#text', 'Hello'], [0, '#shadow-root'], [1, '#text', 'world']]],
<<<<<<< HEAD
      timestamp: jasmine.any(Number),
=======
      timestamp: expect.any(Number),
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
    })
  })
})
