import type { NodeId, StyleSheetId } from '../../itemIds'
import type { VDocument } from './vDocument'
import { createVDocument } from './vDocument'

import { expectConnections, expectFullSnapshotRendering, expectIncrementalSnapshotRendering } from './vDom.specHelper'

describe('VDocument', () => {
  let document: VDocument

  beforeEach(() => {
    document = createVDocument()
  })

  it('initially contains no nodes', () => {
    expect(document.root).toBeUndefined()
    expect(() => {
      document.getNodeById(0 as NodeId)
    }).toThrowError()
  })

  it('initially contains no stylesheets', () => {
    expect(() => {
      document.getStyleSheetById(0 as StyleSheetId)
    }).toThrowError()
  })

  describe('createNode', () => {
    it('creates nodes with monotonically increasing ids', () => {
      const node0 = document.createNode({ kind: '#document' })
      expect(node0.id).toBe(0 as NodeId)
      const node1 = document.createNode({ kind: '#element', tag: 'div', attributes: {} })
      expect(node1.id).toBe(1 as NodeId)
      const node2 = document.createNode({ kind: '#element', tag: 'span', attributes: {} })
      expect(node2.id).toBe(2 as NodeId)
    })
  })

  describe('createStyleSheet', () => {
    it('creates stylesheets with monotonically increasing ids', () => {
      const sheet0 = document.createStyleSheet({ disabled: false, mediaList: [], rules: '' })
      expect(sheet0.id).toBe(0 as StyleSheetId)
      const sheet1 = document.createStyleSheet({ disabled: false, mediaList: [], rules: 'foo { color: red }' })
      expect(sheet1.id).toBe(1 as StyleSheetId)
      const sheet2 = document.createStyleSheet({ disabled: false, mediaList: [], rules: 'bar { width: 100px }' })
      expect(sheet2.id).toBe(2 as StyleSheetId)
    })
  })

  describe('root', () => {
    it('can be attached', () => {
      const rootNode = document.createNode({ kind: '#document' })
      expect(document.root).toBeUndefined()

      document.root = rootNode

      expect(document.root).toBe(rootNode)
      expectConnections(rootNode, {})
    })

    it('cannot be replaced', () => {
      const rootNode = document.createNode({ kind: '#document' })
      document.root = rootNode
      const secondRootNode = document.createNode({ kind: '#document' })

      expect(() => {
        document.root = secondRootNode
      }).toThrowError()
    })

    it('cannot be detached', () => {
      const rootNode = document.createNode({ kind: '#document' })
      document.root = rootNode

      expect(() => {
        document.root = undefined
      }).toThrowError()
    })
  })

  describe('renderAsFullSnapshot', () => {
    it('can render a realistic document', () => {
      // Construct a document which resembles a simple, but realistic, web page.
      const root = document.createNode({ kind: '#document' })
      document.root = root

      const html = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      root.appendChild(html)

      const head = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      html.appendChild(head)

      const title = document.createNode({ kind: '#element', tag: 'title', attributes: {} })
      head.appendChild(title)

      const titleText = document.createNode({ kind: '#text', textContent: 'Test Page' })
      title.appendChild(titleText)

      const meta = document.createNode({ kind: '#element', tag: 'meta', attributes: { charset: 'utf-8' } })
      head.appendChild(meta)

      const body = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      html.appendChild(body)

      const div = document.createNode({ kind: '#element', tag: 'div', attributes: { class: 'container' } })
      body.appendChild(div)

      const h1 = document.createNode({ kind: '#element', tag: 'h1', attributes: {} })
      div.appendChild(h1)

      const h1Text = document.createNode({ kind: '#text', textContent: 'Hello World' })
      h1.appendChild(h1Text)

      const p = document.createNode({ kind: '#element', tag: 'p', attributes: {} })
      div.appendChild(p)

      const pText = document.createNode({ kind: '#text', textContent: 'This is a test paragraph.' })
      p.appendChild(pText)

      const ul = document.createNode({ kind: '#element', tag: 'ul', attributes: {} })
      div.appendChild(ul)

      const li1 = document.createNode({ kind: '#element', tag: 'li', attributes: {} })
      ul.appendChild(li1)

      const li1Text = document.createNode({ kind: '#text', textContent: 'Item 1' })
      li1.appendChild(li1Text)

      const li2 = document.createNode({ kind: '#element', tag: 'li', attributes: {} })
      ul.appendChild(li2)

      const li2Text = document.createNode({ kind: '#text', textContent: 'Item 2' })
      li2.appendChild(li2Text)

      // Check that the rendering matches our expectations.
      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            {
              type: 2,
              id: 1,
              tagName: 'html',
              attributes: {},
              isSVG: undefined,
              childNodes: [
                {
                  type: 2,
                  id: 2,
                  tagName: 'head',
                  attributes: {},
                  isSVG: undefined,
                  childNodes: [
                    {
                      type: 2,
                      id: 3,
                      tagName: 'title',
                      attributes: {},
                      isSVG: undefined,
                      childNodes: [{ type: 3, id: 4, textContent: 'Test Page' }],
                    },
                    {
                      type: 2,
                      id: 5,
                      tagName: 'meta',
                      attributes: { charset: 'utf-8' },
                      isSVG: undefined,
                      childNodes: [],
                    },
                  ],
                },
                {
                  type: 2,
                  id: 6,
                  tagName: 'body',
                  attributes: {},
                  isSVG: undefined,
                  childNodes: [
                    {
                      type: 2,
                      id: 7,
                      tagName: 'div',
                      attributes: { class: 'container' },
                      isSVG: undefined,
                      childNodes: [
                        {
                          type: 2,
                          id: 8,
                          tagName: 'h1',
                          attributes: {},
                          isSVG: undefined,
                          childNodes: [{ type: 3, id: 9, textContent: 'Hello World' }],
                        },
                        {
                          type: 2,
                          id: 10,
                          tagName: 'p',
                          attributes: {},
                          isSVG: undefined,
                          childNodes: [{ type: 3, id: 11, textContent: 'This is a test paragraph.' }],
                        },
                        {
                          type: 2,
                          id: 12,
                          tagName: 'ul',
                          attributes: {},
                          isSVG: undefined,
                          childNodes: [
                            {
                              type: 2,
                              id: 13,
                              tagName: 'li',
                              attributes: {},
                              isSVG: undefined,
                              childNodes: [{ type: 3, id: 14, textContent: 'Item 1' }],
                            },
                            {
                              type: 2,
                              id: 15,
                              tagName: 'li',
                              attributes: {},
                              isSVG: undefined,
                              childNodes: [{ type: 3, id: 16, textContent: 'Item 2' }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })
  })

  describe('renderAsIncrementalSnapshot', () => {
    it('can render nodes being added incrementally', () => {
      // Construct a document which resembles a very simple web page.
      const root = document.createNode({ kind: '#document' })
      document.root = root

      const html = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      root.appendChild(html)

      const head = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      html.appendChild(head)

      const body = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      html.appendChild(body)

      const div = document.createNode({ kind: '#element', tag: 'div', attributes: {} })
      body.appendChild(div)

      const span = document.createNode({ kind: '#element', tag: 'span', attributes: {} })
      body.appendChild(span)

      // Reset the mutation log. Beyond this point, any further changes will be treated
      // as incremental mutations.
      document.mutations.clear()

      // Perform some mutations.
      const meta = document.createNode({ kind: '#element', tag: 'meta', attributes: {} })
      head.appendChild(meta)

      const p = document.createNode({ kind: '#element', tag: 'p', attributes: {} })
      body.appendChild(p)

      const pText = document.createNode({ kind: '#text', textContent: 'Content' })
      div.appendChild(pText)

      // Check that the rendering matches our expectations.
      expectIncrementalSnapshotRendering(
        document,
        {
          adds: [
            {
              nextId: null,
              parentId: 3,
              node: { type: 2, id: 7, tagName: 'p', attributes: {}, isSVG: undefined, childNodes: [] },
            },
            {
              nextId: null,
              parentId: 4,
              node: { type: 3, id: 8, textContent: 'Content' },
            },
            {
              nextId: null,
              parentId: 2,
              node: { type: 2, id: 6, tagName: 'meta', attributes: {}, isSVG: undefined, childNodes: [] },
            },
          ],
          removes: [],
          texts: [],
          attributes: [],
        },
        {
          node: {
            type: 0,
            id: 0,
            childNodes: [
              {
                type: 2,
                id: 1,
                tagName: 'html',
                attributes: {},
                isSVG: undefined,
                childNodes: [
                  {
                    type: 2,
                    id: 2,
                    tagName: 'head',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [{ type: 2, id: 6, tagName: 'meta', attributes: {}, isSVG: undefined, childNodes: [] }],
                  },
                  {
                    type: 2,
                    id: 3,
                    tagName: 'body',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [
                      {
                        type: 2,
                        id: 4,
                        tagName: 'div',
                        attributes: {},
                        isSVG: undefined,
                        childNodes: [{ type: 3, id: 8, textContent: 'Content' }],
                      },
                      { type: 2, id: 5, tagName: 'span', attributes: {}, isSVG: undefined, childNodes: [] },
                      { type: 2, id: 7, tagName: 'p', attributes: {}, isSVG: undefined, childNodes: [] },
                    ],
                  },
                ],
              },
            ],
            adoptedStyleSheets: undefined,
          },
          initialOffset: { left: 0, top: 0 },
        }
      )
    })

    it('can render siblings nodes being added incrementally', () => {
      // Construct a document which resembles a very simple web page.
      const root = document.createNode({ kind: '#document' })
      document.root = root

      const html = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      root.appendChild(html)

      const body = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      html.appendChild(body)

      // Reset the mutation log. Beyond this point, any further changes will be treated
      // as incremental mutations.
      document.mutations.clear()

      // Perform some mutations - add several sibling nodes.
      const div1 = document.createNode({ kind: '#element', tag: 'div', attributes: { id: 'first' } })
      body.appendChild(div1)

      const div2 = document.createNode({ kind: '#element', tag: 'div', attributes: { id: 'second' } })
      body.appendChild(div2)

      const div3 = document.createNode({ kind: '#element', tag: 'div', attributes: { id: 'third' } })
      body.appendChild(div3)

      // Check that the rendering matches our expectations.
      expectIncrementalSnapshotRendering(
        document,
        {
          adds: [
            {
              nextId: null,
              parentId: 2,
              node: { type: 2, id: 5, tagName: 'div', attributes: { id: 'third' }, isSVG: undefined, childNodes: [] },
            },
            {
              nextId: 5,
              parentId: 2,
              node: { type: 2, id: 4, tagName: 'div', attributes: { id: 'second' }, isSVG: undefined, childNodes: [] },
            },
            {
              nextId: 4,
              parentId: 2,
              node: { type: 2, id: 3, tagName: 'div', attributes: { id: 'first' }, isSVG: undefined, childNodes: [] },
            },
          ],
          removes: [],
          texts: [],
          attributes: [],
        },
        {
          node: {
            type: 0,
            id: 0,
            childNodes: [
              {
                type: 2,
                id: 1,
                tagName: 'html',
                attributes: {},
                isSVG: undefined,
                childNodes: [
                  {
                    type: 2,
                    id: 2,
                    tagName: 'body',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [
                      { type: 2, id: 3, tagName: 'div', attributes: { id: 'first' }, isSVG: undefined, childNodes: [] },
                      {
                        type: 2,
                        id: 4,
                        tagName: 'div',
                        attributes: { id: 'second' },
                        isSVG: undefined,
                        childNodes: [],
                      },
                      { type: 2, id: 5, tagName: 'div', attributes: { id: 'third' }, isSVG: undefined, childNodes: [] },
                    ],
                  },
                ],
              },
            ],
            adoptedStyleSheets: undefined,
          },
          initialOffset: { left: 0, top: 0 },
        }
      )
    })

    it('can render a node subtree being added incrementally', () => {
      // Construct a document which resembles a very simple web page.
      const root = document.createNode({ kind: '#document' })
      document.root = root

      const html = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      root.appendChild(html)

      const body = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      html.appendChild(body)

      // Reset the mutation log. Beyond this point, any further changes will be treated
      // as incremental mutations.
      document.mutations.clear()

      // Perform some mutations - add a node subtree.
      const div = document.createNode({ kind: '#element', tag: 'div', attributes: {} })
      body.appendChild(div)

      const ul = document.createNode({ kind: '#element', tag: 'ul', attributes: {} })
      div.appendChild(ul)

      const li1 = document.createNode({ kind: '#element', tag: 'li', attributes: {} })
      ul.appendChild(li1)

      const li1Text = document.createNode({ kind: '#text', textContent: 'First item' })
      li1.appendChild(li1Text)

      const li2 = document.createNode({ kind: '#element', tag: 'li', attributes: {} })
      ul.appendChild(li2)

      const li2Text = document.createNode({ kind: '#text', textContent: 'Second item' })
      li2.appendChild(li2Text)

      // Check that the rendering matches our expectations.
      expectIncrementalSnapshotRendering(
        document,
        {
          adds: [
            {
              nextId: null,
              parentId: 2,
              node: {
                type: 2,
                id: 3,
                tagName: 'div',
                attributes: {},
                isSVG: undefined,
                childNodes: [
                  {
                    type: 2,
                    id: 4,
                    tagName: 'ul',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [
                      {
                        type: 2,
                        id: 5,
                        tagName: 'li',
                        attributes: {},
                        isSVG: undefined,
                        childNodes: [{ type: 3, id: 6, textContent: 'First item' }],
                      },
                      {
                        type: 2,
                        id: 7,
                        tagName: 'li',
                        attributes: {},
                        isSVG: undefined,
                        childNodes: [{ type: 3, id: 8, textContent: 'Second item' }],
                      },
                    ],
                  },
                ],
              },
            },
          ],
          removes: [],
          texts: [],
          attributes: [],
        },
        {
          node: {
            type: 0,
            id: 0,
            childNodes: [
              {
                type: 2,
                id: 1,
                tagName: 'html',
                attributes: {},
                isSVG: undefined,
                childNodes: [
                  {
                    type: 2,
                    id: 2,
                    tagName: 'body',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [
                      {
                        type: 2,
                        id: 3,
                        tagName: 'div',
                        attributes: {},
                        isSVG: undefined,
                        childNodes: [
                          {
                            type: 2,
                            id: 4,
                            tagName: 'ul',
                            attributes: {},
                            isSVG: undefined,
                            childNodes: [
                              {
                                type: 2,
                                id: 5,
                                tagName: 'li',
                                attributes: {},
                                isSVG: undefined,
                                childNodes: [{ type: 3, id: 6, textContent: 'First item' }],
                              },
                              {
                                type: 2,
                                id: 7,
                                tagName: 'li',
                                attributes: {},
                                isSVG: undefined,
                                childNodes: [{ type: 3, id: 8, textContent: 'Second item' }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            adoptedStyleSheets: undefined,
          },
          initialOffset: { left: 0, top: 0 },
        }
      )
    })

    it('can render nodes being removed incrementally', () => {
      // Construct a document which resembles a very simple web page.
      const root = document.createNode({ kind: '#document' })
      document.root = root

      const html = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      root.appendChild(html)

      const body = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      html.appendChild(body)

      const div1 = document.createNode({ kind: '#element', tag: 'div', attributes: { id: 'first' } })
      body.appendChild(div1)

      const div2 = document.createNode({ kind: '#element', tag: 'div', attributes: { id: 'second' } })
      body.appendChild(div2)

      const div3 = document.createNode({ kind: '#element', tag: 'div', attributes: { id: 'third' } })
      body.appendChild(div3)

      const span = document.createNode({ kind: '#element', tag: 'span', attributes: {} })
      body.appendChild(span)

      // Reset the mutation log. Beyond this point, any further changes will be treated
      // as incremental mutations.
      document.mutations.clear()

      // Perform some mutations - remove several nodes (but not ancestors and descendants).
      div1.remove()
      div3.remove()

      // Check that the rendering matches our expectations.
      expectIncrementalSnapshotRendering(
        document,
        {
          adds: [],
          removes: [
            { parentId: 2, id: 3 },
            { parentId: 2, id: 5 },
          ],
          texts: [],
          attributes: [],
        },
        {
          node: {
            type: 0,
            id: 0,
            childNodes: [
              {
                type: 2,
                id: 1,
                tagName: 'html',
                attributes: {},
                isSVG: undefined,
                childNodes: [
                  {
                    type: 2,
                    id: 2,
                    tagName: 'body',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [
                      {
                        type: 2,
                        id: 4,
                        tagName: 'div',
                        attributes: { id: 'second' },
                        isSVG: undefined,
                        childNodes: [],
                      },
                      { type: 2, id: 6, tagName: 'span', attributes: {}, isSVG: undefined, childNodes: [] },
                    ],
                  },
                ],
              },
            ],
            adoptedStyleSheets: undefined,
          },
          initialOffset: { left: 0, top: 0 },
        }
      )
    })

    it('can render a node subtree being removed incrementally', () => {
      // Construct a document which resembles a very simple web page.
      const root = document.createNode({ kind: '#document' })
      document.root = root

      const html = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      root.appendChild(html)

      const body = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      html.appendChild(body)

      const div = document.createNode({ kind: '#element', tag: 'div', attributes: {} })
      body.appendChild(div)

      const ul = document.createNode({ kind: '#element', tag: 'ul', attributes: {} })
      div.appendChild(ul)

      const li1 = document.createNode({ kind: '#element', tag: 'li', attributes: {} })
      ul.appendChild(li1)

      const li1Text = document.createNode({ kind: '#text', textContent: 'First item' })
      li1.appendChild(li1Text)

      const li2 = document.createNode({ kind: '#element', tag: 'li', attributes: {} })
      ul.appendChild(li2)

      const li2Text = document.createNode({ kind: '#text', textContent: 'Second item' })
      li2.appendChild(li2Text)

      const span = document.createNode({ kind: '#element', tag: 'span', attributes: {} })
      body.appendChild(span)

      // Reset the mutation log. Beyond this point, any further changes will be treated
      // as incremental mutations.
      document.mutations.clear()

      // Perform some mutations - remove some descendant nodes, then remove the root of the subtree.
      li1.remove()
      li2.remove()
      div.remove()

      // Check that the rendering matches our expectations.
      expectIncrementalSnapshotRendering(
        document,
        {
          adds: [],
          removes: [
            { parentId: 4, id: 5 },
            { parentId: 4, id: 7 },
            { parentId: 2, id: 3 },
          ],
          texts: [],
          attributes: [],
        },
        {
          node: {
            type: 0,
            id: 0,
            childNodes: [
              {
                type: 2,
                id: 1,
                tagName: 'html',
                attributes: {},
                isSVG: undefined,
                childNodes: [
                  {
                    type: 2,
                    id: 2,
                    tagName: 'body',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [{ type: 2, id: 9, tagName: 'span', attributes: {}, isSVG: undefined, childNodes: [] }],
                  },
                ],
              },
            ],
            adoptedStyleSheets: undefined,
          },
          initialOffset: { left: 0, top: 0 },
        }
      )
    })

    it('can render attributes being changed incrementally', () => {
      // Construct a document which resembles a very simple web page.
      const root = document.createNode({ kind: '#document' })
      document.root = root

      const html = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      root.appendChild(html)

      const body = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      html.appendChild(body)

      const div = document.createNode({ kind: '#element', tag: 'div', attributes: { id: 'container', class: 'old' } })
      body.appendChild(div)

      const span = document.createNode({ kind: '#element', tag: 'span', attributes: { title: 'hello' } })
      body.appendChild(span)

      // Reset the mutation log. Beyond this point, any further changes will be treated
      // as incremental mutations.
      document.mutations.clear()

      // Perform some mutations - change attributes on nodes.
      div.setAttribute('class', 'new')
      div.setAttribute('data-test', 'value')
      span.setAttribute('title', null)
      span.setAttribute('id', 'myspan')

      // Check that the rendering matches our expectations.
      expectIncrementalSnapshotRendering(
        document,
        {
          adds: [],
          removes: [],
          texts: [],
          attributes: [
            { id: 3, attributes: { class: 'new', 'data-test': 'value' } },
            { id: 4, attributes: { title: null, id: 'myspan' } },
          ],
        },
        {
          node: {
            type: 0,
            id: 0,
            childNodes: [
              {
                type: 2,
                id: 1,
                tagName: 'html',
                attributes: {},
                isSVG: undefined,
                childNodes: [
                  {
                    type: 2,
                    id: 2,
                    tagName: 'body',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [
                      {
                        type: 2,
                        id: 3,
                        tagName: 'div',
                        attributes: { id: 'container', class: 'new', 'data-test': 'value' },
                        isSVG: undefined,
                        childNodes: [],
                      },
                      {
                        type: 2,
                        id: 4,
                        tagName: 'span',
                        attributes: { id: 'myspan' },
                        isSVG: undefined,
                        childNodes: [],
                      },
                    ],
                  },
                ],
              },
            ],
            adoptedStyleSheets: undefined,
          },
          initialOffset: { left: 0, top: 0 },
        }
      )
    })

    it('can render text content being changed incrementally', () => {
      // Construct a document which resembles a very simple web page.
      const root = document.createNode({ kind: '#document' })
      document.root = root

      const html = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      root.appendChild(html)

      const body = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      html.appendChild(body)

      const p1 = document.createNode({ kind: '#element', tag: 'p', attributes: {} })
      body.appendChild(p1)

      const p1Text = document.createNode({ kind: '#text', textContent: 'Original text 1' })
      p1.appendChild(p1Text)

      const p2 = document.createNode({ kind: '#element', tag: 'p', attributes: {} })
      body.appendChild(p2)

      const p2Text = document.createNode({ kind: '#text', textContent: 'Original text 2' })
      p2.appendChild(p2Text)

      // Reset the mutation log. Beyond this point, any further changes will be treated
      // as incremental mutations.
      document.mutations.clear()

      // Perform some mutations - change text content.
      p1Text.setTextContent('Updated text 1')
      p2Text.setTextContent('Updated text 2')

      // Check that the rendering matches our expectations.
      expectIncrementalSnapshotRendering(
        document,
        {
          adds: [],
          removes: [],
          texts: [
            { id: 4, value: 'Updated text 1' },
            { id: 6, value: 'Updated text 2' },
          ],
          attributes: [],
        },
        {
          node: {
            type: 0,
            id: 0,
            childNodes: [
              {
                type: 2,
                id: 1,
                tagName: 'html',
                attributes: {},
                isSVG: undefined,
                childNodes: [
                  {
                    type: 2,
                    id: 2,
                    tagName: 'body',
                    attributes: {},
                    isSVG: undefined,
                    childNodes: [
                      {
                        type: 2,
                        id: 3,
                        tagName: 'p',
                        attributes: {},
                        isSVG: undefined,
                        childNodes: [{ type: 3, id: 4, textContent: 'Updated text 1' }],
                      },
                      {
                        type: 2,
                        id: 5,
                        tagName: 'p',
                        attributes: {},
                        isSVG: undefined,
                        childNodes: [{ type: 3, id: 6, textContent: 'Updated text 2' }],
                      },
                    ],
                  },
                ],
              },
            ],
            adoptedStyleSheets: undefined,
          },
          initialOffset: { left: 0, top: 0 },
        }
      )
    })
  })
})
