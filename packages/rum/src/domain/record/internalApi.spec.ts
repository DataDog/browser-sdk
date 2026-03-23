import type { BrowserChangeRecord, BrowserRecord } from '../../types'
import { ChangeType, RecordType } from '../../types'
import { appendElement } from '../../../../rum-core/test'
import { takeFullSnapshot, takeNodeSnapshot } from './internalApi'
import { createChangeDecoder } from './serialization'

describe('takeFullSnapshot', () => {
  it('should produce Meta, Focus, and Change records', () => {
    expect(takeFullSnapshot()).toEqual(
      jasmine.arrayContaining([
        {
          data: {
            height: jasmine.any(Number),
            href: window.location.href,
            width: jasmine.any(Number),
          },
          type: RecordType.Meta,
          timestamp: jasmine.any(Number),
        },
        {
          data: {
            has_focus: document.hasFocus(),
          },
          type: RecordType.Focus,
          timestamp: jasmine.any(Number),
        },
        {
          data: jasmine.any(Object),
          type: RecordType.Change,
          timestamp: jasmine.any(Number),
        },
      ])
    )
  })

  it('should produce VisualViewport records when supported', () => {
    if (!window.visualViewport) {
      pending('visualViewport not supported')
    }

    expect(takeFullSnapshot()).toEqual(
      jasmine.arrayContaining([
        {
          data: jasmine.any(Object),
          type: RecordType.VisualViewport,
          timestamp: jasmine.any(Number),
        },
      ])
    )
  })
})

describe('takeNodeSnapshot', () => {
  function decodeSnapshot(record: BrowserRecord | undefined): BrowserChangeRecord | undefined {
    if (!record) {
      return undefined
    }
    if (record.type !== RecordType.Change) {
      throw new Error(`Unexpected record type ${record.type}`)
    }

    const decoder = createChangeDecoder()
    return decoder.decode(record)
  }

  it('should serialize nodes', () => {
    const node = appendElement('<div>Hello <b>world</b></div>', document.body)
    expect(decodeSnapshot(takeNodeSnapshot(node))).toEqual({
      type: RecordType.Change,
      data: [[ChangeType.AddNode, [null, 'DIV'], [1, '#text', 'Hello '], [0, 'B'], [1, '#text', 'world']]],
      timestamp: jasmine.any(Number),
    })
  })

  it('should serialize shadow hosts', () => {
    const node = appendElement('<div>Hello</div>', document.body)
    const shadowRoot = node.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(document.createTextNode('world'))
    expect(decodeSnapshot(takeNodeSnapshot(node))).toEqual({
      type: RecordType.Change,
      data: [[ChangeType.AddNode, [null, 'DIV'], [1, '#text', 'Hello'], [0, '#shadow-root'], [1, '#text', 'world']]],
      timestamp: jasmine.any(Number),
    })
  })
})
