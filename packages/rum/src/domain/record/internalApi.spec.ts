import { NodeType, RecordType } from '../../types'
import { appendElement } from '../../../../rum-core/test'
import { takeFullSnapshot, takeNodeSnapshot } from './internalApi'

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
          data: {
            node: expect.any(Object),
            initialOffset: {
              left: expect.any(Number),
              top: expect.any(Number),
            },
          },
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
  it('should serialize nodes', () => {
    const node = appendElement('<div>Hello <b>world</b></div>', document.body)
    expect(takeNodeSnapshot(node)).toEqual({
      type: NodeType.Element,
      id: 0,
      tagName: 'div',
      isSVG: undefined,
      attributes: {},
      childNodes: [
        {
          type: NodeType.Text,
          id: 1,
          textContent: 'Hello ',
        },
        {
          type: NodeType.Element,
          id: 2,
          tagName: 'b',
          isSVG: undefined,
          attributes: {},
          childNodes: [
            {
              type: NodeType.Text,
              id: 3,
              textContent: 'world',
            },
          ],
        },
      ],
    })
  })

  it('should serialize shadow hosts', () => {
    const node = appendElement('<div>Hello</div>', document.body)
    const shadowRoot = node.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(document.createTextNode('world'))
    expect(takeNodeSnapshot(node)).toEqual({
      type: NodeType.Element,
      id: 0,
      tagName: 'div',
      isSVG: undefined,
      attributes: {},
      childNodes: [
        {
          type: NodeType.Text,
          id: 1,
          textContent: 'Hello',
        },
        {
          type: NodeType.DocumentFragment,
          id: 2,
          isShadowRoot: true,
          adoptedStyleSheets: undefined,
          childNodes: [
            {
              type: NodeType.Text,
              id: 3,
              textContent: 'world',
            },
          ],
        },
      ],
    })
  })
})
