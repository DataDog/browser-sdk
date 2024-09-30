import type { SerializedNodeWithId, BrowserMutationData, AddedNodeMutation } from '../../types'
import { NodeType } from '../../types'

type SerialisedParentNodeWithId = SerializedNodeWithId & {
  childNodes: SerializedNodeWithId[]
}

const isElementOrDocNode = (node: SerializedNodeWithId): node is SerialisedParentNodeWithId =>
  !!node && (node.type === NodeType.Element || node.type === NodeType.Document)

export function applyDomMutation(
  serialisedNodeMap: Map<number, SerializedNodeWithId>,
  mutationGroups: BrowserMutationData
): void {
  // Add new nodes
  const nodeTree = buildTree(mutationGroups.adds)
  nodeTree.forEach((treeList, parentId) => {
    const parentNode = serialisedNodeMap.get(parentId)
    if (!parentNode) {
      return
    }
    iterateResolveTree(treeList, (mutation: AddedNodeMutation) => {
      appendVirtualNode(mutation, serialisedNodeMap)
    })
  })

  // Update text nodes
  mutationGroups.texts.forEach((mutation) => {
    const serialisedNode = serialisedNodeMap.get(mutation.id)
    if (!serialisedNode || serialisedNode.type !== NodeType.Text) {
      return
    }
    // SDK sends null as an optimization but represents an empty string
    serialisedNode.textContent = mutation.value ?? ''
  })

  // Update Attributes
  mutationGroups.attributes.forEach((mutation) => {
    const serialisedNode = serialisedNodeMap.get(mutation.id)
    if (!serialisedNode) {
      return
    }
    if (serialisedNode.type !== NodeType.Element) {
      return
    }
    for (const attributeName in mutation.attributes) {
      if (attributeName === '__proto__') {
        continue // Security: Prevents prototype pollution
      }

      const currentAttributeValue = serialisedNode.attributes[attributeName]

      /*
                    By spec, after a DOM element (eg a checkbox) is attached to the document and 
                    has been given an HTML attribute of `checked` or `value`, later DOM mutations updating
                    the `checked`/`value` attribute will not change JS state of the element.

                    An input record could set a new JS value, and a subsequent DOM mutation could update
                    the attr value. Because they are encoded the same, the input mutation would be lost by
                    overwriting. To prevent collisions, we ignore updating these fields on DOM mutations once set.
                */
      if (
        currentAttributeValue !== undefined && // attribute never defined
        currentAttributeValue !== false // attribute removed
      ) {
        if (attributeName === 'checked' || attributeName === 'value') {
          return
        }
      }

      serialisedNode.attributes[attributeName] = mutation.attributes[attributeName] ?? false
    }
  })
  // Remove legacy nodes
  mutationGroups.removes.forEach((mutation) => {
    const serialisedNode = serialisedNodeMap.get(mutation.id)
    const serialisedParentNode = serialisedNodeMap.get(mutation.parentId)

    if (!serialisedNode) {
      return
    } else if (!serialisedParentNode) {
      return
    } else if (serialisedParentNode.type !== NodeType.Element && serialisedParentNode.type !== NodeType.Document) {
      return
    }

    // Remove serialised node from tree
    const childPosition = serialisedParentNode.childNodes.findIndex(
      (n: SerializedNodeWithId) => n.id === serialisedNode.id
    )

    if (childPosition === -1) {
      return
    }

    serialisedParentNode.childNodes.splice(childPosition, 1)

    // Remove serialised node from map
    visitSnapshot(serialisedNode, (sNode: SerializedNodeWithId) => {
      serialisedNodeMap.delete(sNode.id)
    })
  })
}

const appendVirtualNode = (mutation: AddedNodeMutation, serialisedNodeMap: Map<number, SerializedNodeWithId>) => {
  const serialisedNode = mutation.node
  const serialisedParentNode = serialisedNodeMap.get(mutation.parentId)

  if (!serialisedParentNode) {
    return
  }

  if (!isElementOrDocNode(serialisedParentNode)) {
    return
  }

  let nextSerialisedNode: SerializedNodeWithId | null = null
  if (mutation.nextId) {
    nextSerialisedNode = serialisedNodeMap.get(mutation.nextId) || null
  }

  if (mutation.nextId !== null && !nextSerialisedNode) {
    // If the next node is not found, log a warning and append the node
  }

  insertBefore(serialisedParentNode, serialisedNode, nextSerialisedNode)

  // Add child nodes to the map
  visitSnapshot(serialisedNode, (node: SerializedNodeWithId) => {
    serialisedNodeMap.set(node.id, node)
  })
}

/**
 * Insert before target node, falling back to appending if next node not found
 */
export const insertBefore = (
  serialisedParentNode: SerialisedParentNodeWithId,
  targetSerialisedNode: SerializedNodeWithId,
  nextSerialisedNode: SerializedNodeWithId | null
) => {
  const serialisedSiblings: SerializedNodeWithId[] = serialisedParentNode.childNodes

  const childPosition =
    nextSerialisedNode && serialisedSiblings.includes(nextSerialisedNode)
      ? serialisedSiblings.findIndex((n) => n.id === nextSerialisedNode.id)
      : serialisedSiblings.length

  if (childPosition !== -1) {
    serialisedSiblings.splice(childPosition, 0, targetSerialisedNode)
  } else {
    serialisedSiblings.push(targetSerialisedNode)
  }
}

function visitSnapshot(node: SerializedNodeWithId, onVisit: (node: SerializedNodeWithId) => void) {
  function walk(current: SerializedNodeWithId) {
    onVisit(current)
    if (current.type === NodeType.Document || current.type === NodeType.Element) {
      current.childNodes.forEach(walk)
    }
  }

  walk(node)
}

type ResolveTree = {
  value: AddedNodeMutation
  children: ResolveTree[]
  parent: ResolveTree | null
}

function iterateResolveTree(treeList: ResolveTree[], cb: (mutation: AddedNodeMutation) => unknown) {
  /**
   * The resolve tree was designed to reflect the DOM layout,
   * but we need append next sibling first, so we do a reverse
   * loop here.
   */
  for (let i = treeList.length - 1; i >= 0; i--) {
    cb(treeList[i].value)
    iterateResolveTree(treeList[i].children, cb)
  }
}

const buildTree = (mutationList: AddedNodeMutation[]): Map<number, ResolveTree[]> => {
  // map of parentIds to plug to and the trees that are related to that parentId
  const trees = new Map<number, ResolveTree[]>()
  const queueNodeMap: Map<number, ResolveTree> = new Map()
  const putIntoMap = (m: AddedNodeMutation, parent: ResolveTree | null): ResolveTree => {
    const nodeInTree: ResolveTree = {
      value: m,
      parent,
      children: [],
    }
    queueNodeMap.set(m.node.id, nodeInTree)
    return nodeInTree
  }

  for (const mutation of mutationList) {
    const { nextId, parentId } = mutation
    const nextInTree = nextId ? queueNodeMap.get(nextId) : undefined
    const parentInTree = queueNodeMap.get(parentId)
    let nodeToAdd
    if (nextInTree) {
      // leaf node, we add the new one to the parents children
      const parent = nextInTree.parent || null
      nodeToAdd = putIntoMap(mutation, parent)
      const siblings = parent
        ? parent.children // we found a parent in the tree
        : trees.get(nextInTree.value.parentId) || [] // sibling is at the root
      addChildInPosition(nodeToAdd, siblings, nextInTree)
    } else if (parentInTree) {
      // leaf node
      nodeToAdd = putIntoMap(mutation, parentInTree)
      addChildInPosition(nodeToAdd, parentInTree.children)
    } else {
      // root node
      nodeToAdd = putIntoMap(mutation, null)
      const childs = trees.get(nodeToAdd.value.parentId)
      if (!childs) {
        trees.set(nodeToAdd.value.parentId, [nodeToAdd])
      } else {
        addChildInPosition(nodeToAdd, childs)
      }
    }
    // see if we have a root with this node as the parent, reconnect both
    reconnectToParent(nodeToAdd, trees)
  }

  return trees
}

const addChildInPosition = (nodeToAdd: ResolveTree, childs: ResolveTree[], nextInTree?: ResolveTree) => {
  if (!nextInTree) {
    childs.push(nodeToAdd)
    return
  }
  const nextPosition = childs.indexOf(nextInTree)
  childs.splice(nextPosition, 0, nodeToAdd)
}

const reconnectToParent = (nodeToAdd: ResolveTree, trees: Map<number, ResolveTree[]>) => {
  const nodeToAddId = nodeToAdd.value.node.id
  const newNodeChilds = trees.get(nodeToAddId)
  if (newNodeChilds) {
    trees.delete(nodeToAddId)
    nodeToAdd.children = newNodeChilds
    newNodeChilds.forEach((node) => {
      node.parent = nodeToAdd
    })
  }
}
