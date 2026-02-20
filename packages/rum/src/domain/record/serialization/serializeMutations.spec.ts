import { beforeEach, describe, expect, it } from 'vitest'
import type { RecordingScope } from '../recordingScope'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { idsAreAssignedForNodeAndAncestors, sortAddedAndMovedNodes } from './serializeMutations'

describe('idsAreAssignedForNodeAndAncestors', () => {
  let scope: RecordingScope

  beforeEach(() => {
    scope = createRecordingScopeForTesting()
  })

  it('returns false for DOM Nodes that have not been assigned an id', () => {
    expect(idsAreAssignedForNodeAndAncestors(document.createElement('div'), scope.nodeIds)).toBe(false)
  })

  it('returns true for DOM Nodes that have been assigned an id', () => {
    const node = document.createElement('div')
    scope.nodeIds.getOrInsert(node)
    expect(idsAreAssignedForNodeAndAncestors(node, scope.nodeIds)).toBe(true)
  })

  it('returns false for DOM Nodes when an ancestor has not been assigned an id', () => {
    const node = document.createElement('div')
    scope.nodeIds.getOrInsert(node)

    const parent = document.createElement('div')
    parent.appendChild(node)
    scope.nodeIds.getOrInsert(parent)

    const grandparent = document.createElement('div')
    grandparent.appendChild(parent)

    expect(idsAreAssignedForNodeAndAncestors(node, scope.nodeIds)).toBe(false)
  })

  it('returns true for DOM Nodes when all ancestors have been assigned an id', () => {
    const node = document.createElement('div')
    scope.nodeIds.getOrInsert(node)

    const parent = document.createElement('div')
    parent.appendChild(node)
    scope.nodeIds.getOrInsert(parent)

    const grandparent = document.createElement('div')
    grandparent.appendChild(parent)
    scope.nodeIds.getOrInsert(grandparent)

    expect(idsAreAssignedForNodeAndAncestors(node, scope.nodeIds)).toBe(true)
  })

  it('returns true for DOM Nodes in shadow subtrees', () => {
    const node = document.createElement('div')
    scope.nodeIds.getOrInsert(node)

    const parent = document.createElement('div')
    parent.appendChild(node)
    scope.nodeIds.getOrInsert(parent)

    const grandparent = document.createElement('div')
    const shadowRoot = grandparent.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(parent)
    scope.nodeIds.getOrInsert(grandparent)

    expect(idsAreAssignedForNodeAndAncestors(node, scope.nodeIds)).toBe(true)
  })
})

describe('sortAddedAndMovedNodes', () => {
  let parent: Node
  let a: Node
  let aa: Node
  let b: Node
  let c: Node
  let d: Node

  beforeEach(() => {
    // Create a tree like this:
    //     parent
    //     / | \ \
    //    a  b c d
    //    |
    //    aa
    a = document.createElement('a')
    aa = document.createElement('aa')
    b = document.createElement('b')
    c = document.createElement('c')
    d = document.createElement('d')
    parent = document.createElement('parent')
    parent.appendChild(a)
    a.appendChild(aa)
    parent.appendChild(b)
    parent.appendChild(c)
    parent.appendChild(d)
  })

  it('sorts siblings in reverse order', () => {
    const nodes = [c, b, d, a]
    sortAddedAndMovedNodes(nodes)
    expect(nodes).toEqual([d, c, b, a])
  })

  it('sorts parents', () => {
    const nodes = [a, parent, aa]
    sortAddedAndMovedNodes(nodes)
    expect(nodes).toEqual([parent, a, aa])
  })

  it('sorts parents first then siblings', () => {
    const nodes = [c, aa, b, parent, d, a]
    sortAddedAndMovedNodes(nodes)
    expect(nodes).toEqual([parent, d, c, b, a, aa])
  })
})
