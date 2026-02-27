import { PlaybackState } from '../../../../types'
import type { NodeId } from '../../itemIds'
import type { VDocument } from './vDocument'
import { createVDocument } from './vDocument'
import type { VNode, VNodeData } from './vNode'
import type { VStyleSheet } from './vStyleSheet'

import { expectConnections, expectFullSnapshotRendering, expectMutations, expectNodeRendering } from './vDom.specHelper'

describe('VNode', () => {
  let document: VDocument

  beforeEach(() => {
    document = createVDocument()
  })

  function expectThrowsForNode(nodeData: VNodeData, action: (node: VNode) => void): void {
    const node = document.createNode(nodeData)
    document.root = node

    expect(() => {
      action(node)
    }).toThrow()
  }

  function expectThrowsForDisconnectedNodes(action: (node: VNode) => void): void {
    const parent = document.createNode({ kind: '#document' })
    document.root = parent

    const removed = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
    parent.appendChild(removed)
    removed.remove()
    expect(() => {
      action(removed)
    }).toThrow()

    const neverAttached = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
    expect(() => {
      action(neverAttached)
    }).toThrow()
  }

  it('has the expected state on creation', () => {
    const nodeData: VNodeData = { kind: '#element', tag: 'div', attributes: {}, isSVG: false }
    const node = document.createNode(nodeData)

    expect(node.data).toEqual(nodeData)
    expect(node.ownerDocument).toBe(document)
    expect(node.id).toBe(0 as NodeId)
    expectConnections(node, { state: 'new' })
    expectMutations(document, {})
  })

  describe('after', () => {
    it('can attach after an only child', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const firstChild = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(firstChild)

      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      firstChild.after(lastChild)

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: lastChild })
      expectConnections(lastChild, { parent, previousSibling: firstChild })
      expectMutations(document, { nodeAdds: [parent, firstChild, lastChild] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            { type: 2, id: 1, tagName: 'html', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 2, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can attach at the end of a child list', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const middleChild = document.createNode({ kind: '#element', tag: 'style', attributes: {} })
      parent.appendChild(middleChild)

      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      middleChild.after(lastChild)

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: middleChild })
      expectConnections(middleChild, { parent, previousSibling: firstChild, nextSibling: lastChild })
      expectConnections(lastChild, { parent, previousSibling: middleChild })
      expectMutations(document, { nodeAdds: [parent, firstChild, middleChild, lastChild] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            {
              type: 2,
              id: 1,
              tagName: 'head',
              attributes: {},
              childNodes: [],
              isSVG: undefined,
            },
            {
              type: 2,
              id: 2,
              tagName: 'style',
              attributes: {},
              childNodes: [],
              isSVG: undefined,
            },
            {
              type: 2,
              id: 3,
              tagName: 'body',
              attributes: {},
              childNodes: [],
              isSVG: undefined,
            },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can attach in the middle of a child list', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      parent.appendChild(lastChild)

      const middleChild = document.createNode({ kind: '#element', tag: 'style', attributes: {} })
      firstChild.after(middleChild)

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: middleChild })
      expectConnections(middleChild, { parent, previousSibling: firstChild, nextSibling: lastChild })
      expectConnections(lastChild, { parent, previousSibling: middleChild })
      expectMutations(document, { nodeAdds: [parent, firstChild, lastChild, middleChild] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            {
              type: 2,
              id: 1,
              tagName: 'head',
              attributes: {},
              childNodes: [],
              isSVG: undefined,
            },
            {
              type: 2,
              id: 3,
              tagName: 'style',
              attributes: {},
              childNodes: [],
              isSVG: undefined,
            },
            {
              type: 2,
              id: 2,
              tagName: 'body',
              attributes: {},
              childNodes: [],
              isSVG: undefined,
            },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('cannot attach a node which is already connected', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)
      const grandChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      child.appendChild(grandChild)

      expect(() => {
        child.after(grandChild)
      }).toThrow()
    })

    it('cannot attach a node to a disconnected sibling', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)
      const node = document.createNode({ kind: '#element', tag: 'div', attributes: {} })

      const removed = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(removed)
      removed.remove()
      expect(() => {
        removed.after(node)
      }).toThrow()

      const neverAttached = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      expect(() => {
        neverAttached.after(node)
      }).toThrow()
    })

    it('cannot attach a node which was previously removed', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)
      const node = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      child.appendChild(node)
      node.remove()

      expect(() => {
        child.after(node)
      }).toThrow()
    })

    it('cannot attach a node as a sibling to the root node', () => {
      const root = document.createNode({ kind: '#document' })
      document.root = root
      const node = document.createNode({ kind: '#element', tag: 'html', attributes: {} })

      expect(() => {
        root.after(node)
      }).toThrow()
    })
  })

  describe('appendChild', () => {
    it('can attach the first child', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)

      expectConnections(parent, { firstChild: child, lastChild: child })
      expectConnections(child, { parent })
      expectMutations(document, { nodeAdds: [parent, child] })

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
              childNodes: [],
              isSVG: undefined,
            },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can attach two children', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      parent.appendChild(lastChild)

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: lastChild })
      expectConnections(lastChild, { parent, previousSibling: firstChild })
      expectMutations(document, { nodeAdds: [parent, firstChild, lastChild] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            { type: 2, id: 1, tagName: 'head', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 2, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can attach three children', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const middleChild = document.createNode({ kind: '#element', tag: 'style', attributes: {} })
      parent.appendChild(middleChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      parent.appendChild(lastChild)

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: middleChild })
      expectConnections(middleChild, { parent, previousSibling: firstChild, nextSibling: lastChild })
      expectConnections(lastChild, { parent, previousSibling: middleChild })
      expectMutations(document, { nodeAdds: [parent, firstChild, middleChild, lastChild] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            { type: 2, id: 1, tagName: 'head', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 2, tagName: 'style', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 3, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('cannot attach a node which is already connected', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)
      const grandChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      child.appendChild(grandChild)

      expect(() => {
        parent.appendChild(grandChild)
      }).toThrow()
    })

    it('cannot attach a node to a disconnected parent', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'style', attributes: {} })

      const removed = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(removed)
      removed.remove()
      expect(() => {
        removed.appendChild(child)
      }).toThrow()

      const neverAttached = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      expect(() => {
        neverAttached.appendChild(child)
      }).toThrow()
    })

    it('cannot attach a node which was previously removed', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)
      const grandChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      child.appendChild(grandChild)
      grandChild.remove()

      expect(() => {
        child.appendChild(grandChild)
      }).toThrow()
    })
  })

  describe('before', () => {
    it('can attach before an only child', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const lastChild = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(lastChild)

      const firstChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      lastChild.before(firstChild)

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: lastChild })
      expectConnections(lastChild, { parent, previousSibling: firstChild })
      expectMutations(document, { nodeAdds: [parent, lastChild, firstChild] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            { type: 2, id: 2, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 1, tagName: 'html', attributes: {}, childNodes: [], isSVG: undefined },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can attach at the beginning of a child list', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const middleChild = document.createNode({ kind: '#element', tag: 'style', attributes: {} })
      parent.appendChild(middleChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(lastChild)

      const firstChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      middleChild.before(firstChild)

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: middleChild })
      expectConnections(middleChild, { parent, previousSibling: firstChild, nextSibling: lastChild })
      expectConnections(lastChild, { parent, previousSibling: middleChild })
      expectMutations(document, { nodeAdds: [parent, middleChild, lastChild, firstChild] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            { type: 2, id: 3, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 1, tagName: 'style', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 2, tagName: 'head', attributes: {}, childNodes: [], isSVG: undefined },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can attach in the middle of a child list', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      parent.appendChild(lastChild)

      const middleChild = document.createNode({ kind: '#element', tag: 'style', attributes: {} })
      lastChild.before(middleChild)

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: middleChild })
      expectConnections(middleChild, { parent, previousSibling: firstChild, nextSibling: lastChild })
      expectConnections(lastChild, { parent, previousSibling: middleChild })
      expectMutations(document, { nodeAdds: [parent, firstChild, lastChild, middleChild] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            { type: 2, id: 1, tagName: 'head', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 3, tagName: 'style', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 2, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('cannot attach a node which is already connected', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)
      const grandChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      child.appendChild(grandChild)

      expect(() => {
        child.before(grandChild)
      }).toThrow()
    })

    it('cannot attach a node to a disconnected sibling', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)
      const node = document.createNode({ kind: '#element', tag: 'div', attributes: {} })

      const removed = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(removed)
      removed.remove()
      expect(() => {
        removed.before(node)
      }).toThrow()

      const neverAttached = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      expect(() => {
        neverAttached.before(node)
      }).toThrow()
    })

    it('cannot attach a node which was previously removed', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)
      const node = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      child.appendChild(node)
      node.remove()

      expect(() => {
        child.before(node)
      }).toThrow()
    })

    it('cannot attach a node as a sibling to the root node', () => {
      const root = document.createNode({ kind: '#document' })
      document.root = root
      const node = document.createNode({ kind: '#element', tag: 'html', attributes: {} })

      expect(() => {
        root.before(node)
      }).toThrow()
    })
  })

  describe('remove', () => {
    it('can remove an only child', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const child = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(child)

      child.remove()

      expectConnections(parent, {})
      expectConnections(child, { state: 'disconnected' })
      expectMutations(document, { nodeAdds: [parent, child], nodeRemoves: [{ node: child, parent }] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can remove a node from the end of a child list', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      parent.appendChild(lastChild)

      lastChild.remove()

      expectConnections(parent, { firstChild, lastChild: firstChild })
      expectConnections(firstChild, { parent })
      expectConnections(lastChild, { state: 'disconnected' })
      expectMutations(document, {
        nodeAdds: [parent, firstChild, lastChild],
        nodeRemoves: [{ node: lastChild, parent }],
      })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [{ type: 2, id: 1, tagName: 'head', attributes: {}, childNodes: [], isSVG: undefined }],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can remove a node from the beginning of a child list', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      parent.appendChild(lastChild)

      firstChild.remove()

      expectConnections(parent, { firstChild: lastChild, lastChild })
      expectConnections(firstChild, { state: 'disconnected' })
      expectConnections(lastChild, { parent })
      expectMutations(document, {
        nodeAdds: [parent, firstChild, lastChild],
        nodeRemoves: [{ node: firstChild, parent }],
      })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [{ type: 2, id: 2, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined }],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can remove a node from the middle of a child list', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const middleChild = document.createNode({ kind: '#element', tag: 'style', attributes: {} })
      parent.appendChild(middleChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      parent.appendChild(lastChild)

      middleChild.remove()

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: lastChild })
      expectConnections(middleChild, { state: 'disconnected' })
      expectConnections(lastChild, { parent, previousSibling: firstChild })
      expectMutations(document, {
        nodeAdds: [parent, firstChild, middleChild, lastChild],
        nodeRemoves: [{ node: middleChild, parent }],
      })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            { type: 2, id: 1, tagName: 'head', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 3, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can remove a node with descendants', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent
      const firstChild = document.createNode({ kind: '#element', tag: 'head', attributes: {} })
      parent.appendChild(firstChild)
      const middleChild = document.createNode({ kind: '#element', tag: 'style', attributes: {} })
      parent.appendChild(middleChild)
      const lastChild = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      parent.appendChild(lastChild)
      const middleFirstChild = document.createNode({ kind: '#element', tag: 'div', attributes: {} })
      middleChild.appendChild(middleFirstChild)
      const middleLastChild = document.createNode({ kind: '#element', tag: 'span', attributes: {} })
      middleChild.appendChild(middleLastChild)

      middleChild.remove()

      expectConnections(parent, { firstChild, lastChild })
      expectConnections(firstChild, { parent, nextSibling: lastChild })
      expectConnections(middleChild, {
        state: 'disconnected',
        firstChild: middleFirstChild,
        lastChild: middleLastChild,
      })
      expectConnections(lastChild, { parent, previousSibling: firstChild })
      expectConnections(middleFirstChild, { state: 'disconnected', parent: middleChild, nextSibling: middleLastChild })
      expectConnections(middleLastChild, {
        state: 'disconnected',
        parent: middleChild,
        previousSibling: middleFirstChild,
      })
      expectMutations(document, {
        nodeAdds: [parent, firstChild, middleChild, lastChild, middleFirstChild, middleLastChild],
        nodeRemoves: [{ node: middleChild, parent }],
      })

      expectFullSnapshotRendering(document, {
        node: {
          type: 0,
          id: 0,
          childNodes: [
            { type: 2, id: 1, tagName: 'head', attributes: {}, childNodes: [], isSVG: undefined },
            { type: 2, id: 3, tagName: 'body', attributes: {}, childNodes: [], isSVG: undefined },
          ],
          adoptedStyleSheets: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can remove a node which has already been removed', () => {
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      const removed = document.createNode({ kind: '#element', tag: 'html', attributes: {} })
      parent.appendChild(removed)
      removed.remove()
      expect(() => {
        removed.remove()
      }).not.toThrow()
    })

    it('cannot remove a node which has never been attached', () => {
      const neverAttached = document.createNode({ kind: '#element', tag: 'body', attributes: {} })
      expect(() => {
        neverAttached.remove()
      }).toThrow()
    })

    it('cannot remove the root node', () => {
      const root = document.createNode({ kind: '#document' })
      document.root = root

      expect(() => {
        root.remove()
      }).toThrow()
    })
  })

  describe('setAttachedStyleSheets', () => {
    let sheet: VStyleSheet

    beforeEach(() => {
      sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: 'div { color: blue }',
      })
    })

    function expectCanAttachStyleSheet(nodeData: VNodeData & { attachedStyleSheets?: [VStyleSheet] }): void {
      const node = document.createNode(nodeData)
      document.root = node

      node.setAttachedStyleSheets([sheet])

      expect(nodeData.attachedStyleSheets).toEqual([sheet])

      // Incremental mutations for stylesheet attachment aren't supported yet.
      expectMutations(document, { nodeAdds: [node] })
    }

    it('cannot attach stylesheets to #cdata-section nodes', () => {
      expectThrowsForNode({ kind: '#cdata-section' }, (node) => node.setAttachedStyleSheets([sheet]))
    })

    it('cannot attach stylesheets to #doctype nodes', () => {
      expectThrowsForNode({ kind: '#doctype', name: '', publicId: '', systemId: '' }, (node) =>
        node.setAttachedStyleSheets([sheet])
      )
    })

    it('can attach stylesheets to #document nodes', () => {
      expectCanAttachStyleSheet({ kind: '#document' })
    })

    it('can attach stylesheets to #element nodes', () => {
      expectCanAttachStyleSheet({ kind: '#element', tag: 'style', attributes: {} })
    })

    it('can attach stylesheets to #document-fragment nodes', () => {
      expectCanAttachStyleSheet({ kind: '#document-fragment' })
    })

    it('can attach stylesheets to #shadow-root nodes', () => {
      expectCanAttachStyleSheet({ kind: '#shadow-root' })
    })

    it('cannot attach stylesheets to #text', () => {
      expectThrowsForNode({ kind: '#text', textContent: '' }, (node) => node.setAttachedStyleSheets([sheet]))
    })

    it('cannot attach stylesheets to a node which is not connected', () => {
      expectThrowsForDisconnectedNodes((node: VNode) => {
        node.setAttachedStyleSheets([sheet])
      })
    })
  })

  describe('setAttribute', () => {
    it('cannot set an attribute on #cdata-section nodes', () => {
      expectThrowsForNode({ kind: '#cdata-section' }, (node) => node.setAttribute('foo', 'bar'))
    })

    it('cannot set an attribute on #doctype nodes', () => {
      expectThrowsForNode({ kind: '#doctype', name: '', publicId: '', systemId: '' }, (node) =>
        node.setAttribute('foo', 'bar')
      )
    })

    it('cannot set an attribute on #document nodes', () => {
      expectThrowsForNode({ kind: '#document' }, (node) => node.setAttribute('foo', 'bar'))
    })

    it('cannot set an attribute on #document-fragment nodes', () => {
      expectThrowsForNode({ kind: '#document-fragment' }, (node) => node.setAttribute('foo', 'bar'))
    })

    it('can set an attribute on #element nodes', () => {
      const elementData: VNodeData = { kind: '#element', tag: 'div', attributes: {} }
      const element = document.createNode(elementData)
      document.root = element

      element.setAttribute('foo', 'bar')

      expect(elementData.attributes).toEqual({ foo: 'bar' })
      expectMutations(document, { attributeChanges: [{ node: element, attributes: ['foo'] }], nodeAdds: [element] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 2,
          id: 0,
          tagName: 'div',
          attributes: { foo: 'bar' },
          childNodes: [],
          isSVG: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can set multiple attributes on #element nodes', () => {
      const elementData: VNodeData = { kind: '#element', tag: 'div', attributes: {} }
      const element = document.createNode(elementData)
      document.root = element

      element.setAttribute('foo', 'bar')
      element.setAttribute('baz', 'bat')

      expect(elementData.attributes).toEqual({ foo: 'bar', baz: 'bat' })
      expectMutations(document, {
        attributeChanges: [{ node: element, attributes: ['foo', 'baz'] }],
        nodeAdds: [element],
      })

      expectFullSnapshotRendering(document, {
        node: {
          type: 2,
          id: 0,
          tagName: 'div',
          attributes: { foo: 'bar', baz: 'bat' },
          childNodes: [],
          isSVG: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can clear an attribute on #element nodes', () => {
      const elementData: VNodeData = { kind: '#element', tag: 'div', attributes: {} }
      const element = document.createNode(elementData)
      document.root = element

      element.setAttribute('foo', 'bar')
      element.setAttribute('foo', null)

      expect(elementData.attributes).toEqual({})
      expectMutations(document, { attributeChanges: [{ node: element, attributes: ['foo'] }], nodeAdds: [element] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 2,
          id: 0,
          tagName: 'div',
          attributes: {},
          childNodes: [],
          isSVG: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('can clear an attribute on #element nodes which was not already set', () => {
      const elementData: VNodeData = { kind: '#element', tag: 'div', attributes: {} }
      const element = document.createNode(elementData)
      document.root = element

      element.setAttribute('foo', null)

      expect(elementData.attributes).toEqual({})
      expectMutations(document, { attributeChanges: [{ node: element, attributes: ['foo'] }], nodeAdds: [element] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 2,
          id: 0,
          tagName: 'div',
          attributes: {},
          childNodes: [],
          isSVG: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('cannot set an attribute on #shadow-root nodes', () => {
      expectThrowsForNode({ kind: '#shadow-root' }, (node) => node.setAttribute('foo', 'bar'))
    })

    it('cannot set an attribute on #text nodes', () => {
      expectThrowsForNode({ kind: '#text', textContent: '' }, (node) => node.setAttribute('foo', 'bar'))
    })

    it('cannot set an attribute on a node which is not connected', () => {
      expectThrowsForDisconnectedNodes((node: VNode) => {
        node.setAttribute('foo', 'bar')
      })
    })
  })

  describe('setPlaybackState', () => {
    it('cannot set playback state on #cdata-section nodes', () => {
      expectThrowsForNode({ kind: '#cdata-section' }, (node) => node.setPlaybackState(PlaybackState.Playing))
    })

    it('cannot set playback state on #doctype nodes', () => {
      expectThrowsForNode({ kind: '#doctype', name: '', publicId: '', systemId: '' }, (node) =>
        node.setPlaybackState(PlaybackState.Playing)
      )
    })

    it('cannot set playback state on #document nodes', () => {
      expectThrowsForNode({ kind: '#document' }, (node) => node.setPlaybackState(PlaybackState.Playing))
    })

    it('cannot set playback state on #document-fragment nodes', () => {
      expectThrowsForNode({ kind: '#document-fragment' }, (node) => node.setPlaybackState(PlaybackState.Playing))
    })

    it('can set playback state on #element nodes', () => {
      const elementData: VNodeData = { kind: '#element', tag: 'div', attributes: {} }
      const element = document.createNode(elementData)
      document.root = element
      expect(elementData.playbackState).toBe(undefined)

      element.setPlaybackState(PlaybackState.Playing)
      expect(elementData.playbackState).toBe(PlaybackState.Playing)

      element.setPlaybackState(PlaybackState.Paused)
      expect(elementData.playbackState).toBe(PlaybackState.Paused)

      // Incremental mutations for playback state aren't supported yet.
      expectMutations(document, { nodeAdds: [element] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 2,
          id: 0,
          tagName: 'div',
          attributes: { rr_mediaState: 'paused' },
          childNodes: [],
          isSVG: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('cannot set playback state on #shadow-root nodes', () => {
      expectThrowsForNode({ kind: '#shadow-root' }, (node) => node.setPlaybackState(PlaybackState.Playing))
    })

    it('cannot set playback state on #text nodes', () => {
      expectThrowsForNode({ kind: '#text', textContent: '' }, (node) => node.setPlaybackState(PlaybackState.Playing))
    })

    it('cannot set playback state on a node which is not connected', () => {
      expectThrowsForDisconnectedNodes((node: VNode) => {
        node.setPlaybackState(PlaybackState.Paused)
      })
    })
  })

  describe('setScrollPosition', () => {
    function describeScrollPositionBehavior(
      createNodeData: () => VNodeData & { scrollLeft?: number; scrollTop?: number }
    ): void {
      it('can set scroll position', () => {
        const nodeData = createNodeData()
        const node = document.createNode(nodeData)
        document.root = node
        expect(nodeData.scrollLeft).toBe(undefined)
        expect(nodeData.scrollTop).toBe(undefined)

        node.setScrollPosition(5, 10)
        expect(nodeData.scrollLeft).toBe(5)
        expect(nodeData.scrollTop).toBe(10)

        node.setScrollPosition(10, 20)
        expect(nodeData.scrollLeft).toBe(10)
        expect(nodeData.scrollTop).toBe(20)

        // Incremental mutations for scroll position aren't supported yet.
        expectMutations(document, { nodeAdds: [node] })

        if (nodeData.kind === '#element') {
          expectFullSnapshotRendering(document, {
            node: {
              type: 2,
              id: 0,
              tagName: nodeData.tag,
              attributes: { rr_scrollLeft: 10, rr_scrollTop: 20 },
              childNodes: [],
              isSVG: undefined,
            },
            initialOffset: { left: 10, top: 20 },
          })
        } else if (nodeData.kind === '#document') {
          expectFullSnapshotRendering(document, {
            node: {
              type: 0,
              id: 0,
              childNodes: [],
              adoptedStyleSheets: undefined,
            },
            initialOffset: { left: 10, top: 20 },
          })
        }
      })

      it('ignores zero initial scroll coordinates', () => {
        const nodeData = createNodeData()
        const node = document.createNode(nodeData)
        document.root = node
        expect(nodeData.scrollLeft).toBe(undefined)
        expect(nodeData.scrollTop).toBe(undefined)

        node.setScrollPosition(0, 0)
        expect(nodeData.scrollLeft).toBe(undefined)
        expect(nodeData.scrollTop).toBe(undefined)

        // Incremental mutations for scroll position aren't supported yet.
        expectMutations(document, { nodeAdds: [node] })

        if (nodeData.kind === '#element') {
          expectFullSnapshotRendering(document, {
            node: {
              type: 2,
              id: 0,
              tagName: nodeData.tag,
              attributes: {},
              childNodes: [],
              isSVG: undefined,
            },
            initialOffset: { left: 0, top: 0 },
          })
        } else if (nodeData.kind === '#document') {
          expectFullSnapshotRendering(document, {
            node: {
              type: 0,
              id: 0,
              childNodes: [],
              adoptedStyleSheets: undefined,
            },
            initialOffset: { left: 0, top: 0 },
          })
        }
      })

      it('sets zero scroll coordinates on #element nodes if they were previously non-zero', () => {
        const nodeData = createNodeData()
        const node = document.createNode(nodeData)
        document.root = node
        expect(nodeData.scrollLeft).toBe(undefined)
        expect(nodeData.scrollTop).toBe(undefined)

        node.setScrollPosition(10, 20)
        expect(nodeData.scrollLeft).toBe(10)
        expect(nodeData.scrollTop).toBe(20)

        node.setScrollPosition(0, 0)
        expect(nodeData.scrollLeft).toBe(0)
        expect(nodeData.scrollTop).toBe(0)

        // Incremental mutations for scroll position aren't supported yet.
        expectMutations(document, { nodeAdds: [node] })

        if (nodeData.kind === '#element') {
          expectFullSnapshotRendering(document, {
            node: {
              type: 2,
              id: 0,
              tagName: nodeData.tag,
              attributes: {},
              childNodes: [],
              isSVG: undefined,
            },
            initialOffset: { left: 0, top: 0 },
          })
        } else if (nodeData.kind === '#document') {
          expectFullSnapshotRendering(document, {
            node: {
              type: 0,
              id: 0,
              childNodes: [],
              adoptedStyleSheets: undefined,
            },
            initialOffset: { left: 0, top: 0 },
          })
        }
      })

      it('ignores zero initial scroll coordinates on #element nodes independently for each coordinate', () => {
        const node1Data = createNodeData()
        const node1 = document.createNode(node1Data)
        document.root = node1
        const node2Data = createNodeData()
        const node2 = document.createNode(node2Data)
        node1.appendChild(node2)

        expect(node1Data.scrollLeft).toBe(undefined)
        expect(node1Data.scrollTop).toBe(undefined)
        expect(node2Data.scrollLeft).toBe(undefined)
        expect(node2Data.scrollTop).toBe(undefined)

        node1.setScrollPosition(0, 20)
        expect(node1Data.scrollLeft).toBe(undefined)
        expect(node1Data.scrollTop).toBe(20)

        node2.setScrollPosition(10, 0)
        expect(node2Data.scrollLeft).toBe(10)
        expect(node2Data.scrollTop).toBe(undefined)

        // Incremental mutations for scroll position aren't supported yet.
        expectMutations(document, { nodeAdds: [node1, node2] })

        if (node1Data.kind === '#element' && node2Data.kind === '#element') {
          expectFullSnapshotRendering(document, {
            node: {
              type: 2,
              id: 0,
              tagName: node1Data.tag,
              attributes: { rr_scrollTop: 20 },
              childNodes: [
                {
                  type: 2,
                  id: 1,
                  tagName: node2Data.tag,
                  attributes: { rr_scrollLeft: 10 },
                  childNodes: [],
                  isSVG: undefined,
                },
              ],
              isSVG: undefined,
            },
            initialOffset: { left: 0, top: 20 },
          })
        } else if (node1Data.kind === '#document' && node2Data.kind === '#document') {
          expectFullSnapshotRendering(document, {
            node: {
              type: 0,
              id: 0,
              childNodes: [
                {
                  type: 0,
                  id: 1,
                  childNodes: [],
                  adoptedStyleSheets: undefined,
                },
              ],
              adoptedStyleSheets: undefined,
            },
            initialOffset: { left: 0, top: 20 },
          })
        }
      })
    }

    it('cannot set scroll position on #cdata-section nodes', () => {
      expectThrowsForNode({ kind: '#cdata-section' }, (node) => node.setScrollPosition(10, 20))
    })

    describe('for #element nodes', () => {
      describeScrollPositionBehavior(() => ({
        kind: '#element',
        tag: 'div',
        attributes: {},
      }))
    })

    it('cannot set scroll position on #doctype nodes', () => {
      expectThrowsForNode({ kind: '#doctype', name: '', publicId: '', systemId: '' }, (node) =>
        node.setScrollPosition(10, 20)
      )
    })

    describe('for #document nodes', () => {
      describeScrollPositionBehavior(() => ({ kind: '#document' }))
    })

    it('cannot set scroll position on #document-fragment nodes', () => {
      expectThrowsForNode({ kind: '#document-fragment' }, (node) => node.setScrollPosition(10, 20))
    })

    it('cannot set scroll position on #shadow-root nodes', () => {
      expectThrowsForNode({ kind: '#shadow-root' }, (node) => node.setScrollPosition(10, 20))
    })

    it('cannot set scroll position on #text nodes', () => {
      expectThrowsForNode({ kind: '#text', textContent: '' }, (node) => node.setScrollPosition(10, 20))
    })

    it('cannot set scroll position on a node which is not connected', () => {
      expectThrowsForDisconnectedNodes((node: VNode) => {
        node.setScrollPosition(10, 20)
      })
    })
  })

  describe('setSize', () => {
    it('cannot set size on #cdata-section nodes', () => {
      expectThrowsForNode({ kind: '#cdata-section' }, (node) => node.setSize(10, 20))
    })

    it('cannot set size on #doctype nodes', () => {
      expectThrowsForNode({ kind: '#doctype', name: '', publicId: '', systemId: '' }, (node) => node.setSize(10, 20))
    })

    it('cannot set size on #document nodes', () => {
      expectThrowsForNode({ kind: '#document' }, (node) => node.setSize(10, 20))
    })

    it('cannot set size on #document-fragment nodes', () => {
      expectThrowsForNode({ kind: '#document-fragment' }, (node) => node.setSize(10, 20))
    })

    it('can set size on #element nodes', () => {
      const elementData: VNodeData = { kind: '#element', tag: 'div', attributes: {} }
      const element = document.createNode(elementData)
      document.root = element
      expect(elementData.width).toBe(undefined)
      expect(elementData.height).toBe(undefined)

      element.setSize(1, 2)
      expect(elementData.width).toBe(1)
      expect(elementData.height).toBe(2)

      element.setSize(10, 20)
      expect(elementData.width).toBe(10)
      expect(elementData.height).toBe(20)

      // Incremental mutations for size aren't supported yet.
      expectMutations(document, { nodeAdds: [element] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 2,
          id: 0,
          tagName: 'div',
          attributes: { rr_width: '10px', rr_height: '20px' },
          childNodes: [],
          isSVG: undefined,
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('cannot set size on #shadow-root nodes', () => {
      expectThrowsForNode({ kind: '#shadow-root' }, (node) => node.setSize(10, 20))
    })

    it('cannot set size on #text nodes', () => {
      expectThrowsForNode({ kind: '#text', textContent: '' }, (node) => node.setSize(10, 20))
    })

    it('cannot set size on a node which is not connected', () => {
      expectThrowsForDisconnectedNodes((node: VNode) => {
        node.setSize(10, 20)
      })
    })
  })

  describe('setTextContent', () => {
    it('cannot set text content on #cdata-section nodes', () => {
      expectThrowsForNode({ kind: '#cdata-section' }, (node) => node.setTextContent(''))
    })

    it('cannot set text content on #doctype nodes', () => {
      expectThrowsForNode({ kind: '#doctype', name: '', publicId: '', systemId: '' }, (node) => node.setTextContent(''))
    })

    it('cannot set text content on #document nodes', () => {
      expectThrowsForNode({ kind: '#document' }, (node) => node.setTextContent(''))
    })

    it('cannot set text content on #document-fragment nodes', () => {
      expectThrowsForNode({ kind: '#document-fragment' }, (node) => node.setTextContent(''))
    })

    it('cannot set text content on #element nodes', () => {
      expectThrowsForNode({ kind: '#element', tag: 'div', attributes: {} }, (node) => node.setTextContent(''))
    })

    it('cannot set text content on #shadow-root nodes', () => {
      expectThrowsForNode({ kind: '#shadow-root' }, (node) => node.setTextContent(''))
    })

    it('can set text content on #text nodes', () => {
      const textData: VNodeData = { kind: '#text', textContent: '' }
      const text = document.createNode(textData)
      document.root = text
      expect(textData.textContent).toBe('')

      text.setTextContent('foo')
      expect(textData.textContent).toBe('foo')

      text.setTextContent('bar')
      expect(textData.textContent).toBe('bar')

      expectMutations(document, { nodeAdds: [text], textChanges: [text] })

      expectFullSnapshotRendering(document, {
        node: {
          type: 3,
          id: 0,
          textContent: 'bar',
        },
        initialOffset: { left: 0, top: 0 },
      })
    })

    it('cannot set text content on a node which is not connected', () => {
      expectThrowsForDisconnectedNodes((node: VNode) => {
        node.setTextContent('')
      })
    })
  })

  describe('render', () => {
    it('can render a #cdata-section node', () => {
      // Create a parent node to hold both test nodes
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      // Minimal #cdata-section node (no optional properties)
      const minimalNode = document.createNode({ kind: '#cdata-section' })
      parent.appendChild(minimalNode)
      expectNodeRendering(minimalNode, {
        type: 4,
        id: 1,
        textContent: '',
      })

      // Maximal #cdata-section node (same as minimal - no optional properties)
      const maximalNode = document.createNode({ kind: '#cdata-section' })
      parent.appendChild(maximalNode)
      expectNodeRendering(maximalNode, {
        type: 4,
        id: 2,
        textContent: '',
      })
    })

    it('can render a #doctype node', () => {
      // Create a parent node to hold both test nodes
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      // Minimal #doctype node (empty strings)
      const minimalNode = document.createNode({ kind: '#doctype', name: '', publicId: '', systemId: '' })
      parent.appendChild(minimalNode)
      expectNodeRendering(minimalNode, {
        type: 1,
        id: 1,
        name: '',
        publicId: '',
        systemId: '',
      })

      // Maximal #doctype node (all properties set)
      const maximalNode = document.createNode({
        kind: '#doctype',
        name: 'html',
        publicId: '-//W3C//DTD XHTML 1.0 Strict//EN',
        systemId: 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd',
      })
      parent.appendChild(maximalNode)
      expectNodeRendering(maximalNode, {
        type: 1,
        id: 2,
        name: 'html',
        publicId: '-//W3C//DTD XHTML 1.0 Strict//EN',
        systemId: 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd',
      })
    })

    it('can render a #document node', () => {
      // Minimal #document node (no optional properties)
      const minimalNode = document.createNode({ kind: '#document' })
      document.root = minimalNode
      expectNodeRendering(minimalNode, {
        type: 0,
        id: 0,
        childNodes: [],
        adoptedStyleSheets: undefined,
      })

      // Maximal #document node (all optional properties set)
      const styleSheet = document.createStyleSheet({
        disabled: true,
        mediaList: ['screen', 'print'],
        rules: 'div { color: red }',
      })
      const maximalData: VNodeData = { kind: '#document' }
      const maximalNode = document.createNode(maximalData)
      minimalNode.appendChild(maximalNode)
      maximalNode.setAttachedStyleSheets([styleSheet])
      expectNodeRendering(maximalNode, {
        type: 0,
        id: 1,
        childNodes: [],
        adoptedStyleSheets: [
          {
            cssRules: ['div { color: red }'],
            disabled: true,
            media: ['screen', 'print'],
          },
        ],
      })
    })

    it('can render a #document-fragment node', () => {
      // Create a parent node to hold both test nodes
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      // Minimal #document-fragment node (no optional properties)
      const minimalNode = document.createNode({ kind: '#document-fragment' })
      parent.appendChild(minimalNode)
      expectNodeRendering(minimalNode, {
        type: 11,
        id: 1,
        childNodes: [],
        adoptedStyleSheets: undefined,
        isShadowRoot: false,
      })

      // Maximal #document-fragment node (all optional properties set)
      const styleSheet = document.createStyleSheet({
        disabled: true,
        mediaList: ['screen', 'print'],
        rules: 'span { background: yellow }',
      })
      const maximalData: VNodeData = { kind: '#document-fragment' }
      const maximalNode = document.createNode(maximalData)
      parent.appendChild(maximalNode)
      maximalNode.setAttachedStyleSheets([styleSheet])
      expectNodeRendering(maximalNode, {
        type: 11,
        id: 2,
        childNodes: [],
        adoptedStyleSheets: [
          {
            cssRules: ['span { background: yellow }'],
            disabled: true,
            media: ['screen', 'print'],
          },
        ],
        isShadowRoot: false,
      })
    })

    it('can render a #element node', () => {
      // Create a parent node to hold both test nodes
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      // Minimal #element node (no optional properties)
      const minimalNode = document.createNode({ kind: '#element', tag: 'div', attributes: {} })
      parent.appendChild(minimalNode)
      expectNodeRendering(minimalNode, {
        type: 2,
        id: 1,
        tagName: 'div',
        attributes: {},
        childNodes: [],
        isSVG: undefined,
      })

      // Maximal #element node (all optional properties set)
      const styleSheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: 'p { font-size: 14px }',
      })
      const maximalData: VNodeData = {
        kind: '#element',
        tag: 'svg',
        attributes: { id: 'test', class: 'foo' },
        isSVG: true,
      }
      const maximalNode = document.createNode(maximalData)
      parent.appendChild(maximalNode)
      maximalNode.setPlaybackState(PlaybackState.Playing)
      maximalNode.setScrollPosition(10, 20)
      maximalNode.setSize(100, 200)
      maximalNode.setAttachedStyleSheets([styleSheet])
      expectNodeRendering(maximalNode, {
        type: 2,
        id: 2,
        tagName: 'svg',
        attributes: {
          rr_width: '100px',
          rr_height: '200px',
          id: 'test',
          class: 'foo',
          _cssText: 'p { font-size: 14px }',
          rr_mediaState: 'played',
          rr_scrollLeft: 10,
          rr_scrollTop: 20,
        },
        childNodes: [],
        isSVG: true,
      })
    })

    it('can render a #shadow-root node', () => {
      // Create a parent node to hold both test nodes
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      // Minimal #shadow-root node (no optional properties)
      const minimalNode = document.createNode({ kind: '#shadow-root' })
      parent.appendChild(minimalNode)
      expectNodeRendering(minimalNode, {
        type: 11,
        id: 1,
        childNodes: [],
        adoptedStyleSheets: undefined,
        isShadowRoot: true,
      })

      // Maximal #shadow-root node (all optional properties set)
      const styleSheet = document.createStyleSheet({
        disabled: true,
        mediaList: ['screen'],
        rules: 'h1 { color: blue }',
      })
      const maximalData: VNodeData = { kind: '#shadow-root' }
      const maximalNode = document.createNode(maximalData)
      parent.appendChild(maximalNode)
      maximalNode.setAttachedStyleSheets([styleSheet])
      expectNodeRendering(maximalNode, {
        type: 11,
        id: 2,
        childNodes: [],
        adoptedStyleSheets: [
          {
            cssRules: ['h1 { color: blue }'],
            disabled: true,
            media: ['screen'],
          },
        ],
        isShadowRoot: true,
      })
    })

    it('can render a #text node', () => {
      // Create a parent node to hold both test nodes
      const parent = document.createNode({ kind: '#document' })
      document.root = parent

      // Minimal #text node (empty textContent)
      const minimalNode = document.createNode({ kind: '#text', textContent: '' })
      parent.appendChild(minimalNode)
      expectNodeRendering(minimalNode, {
        type: 3,
        id: 1,
        textContent: '',
      })

      // Maximal #text node (non-empty textContent)
      const maximalNode = document.createNode({ kind: '#text', textContent: 'Hello, world!' })
      parent.appendChild(maximalNode)
      expectNodeRendering(maximalNode, {
        type: 3,
        id: 2,
        textContent: 'Hello, world!',
      })
    })
  })
})
