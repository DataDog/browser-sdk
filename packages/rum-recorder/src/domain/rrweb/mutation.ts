import { monitor } from '@datadog/browser-core'
import {
  getSerializedNodeId,
  hasSerializedNode,
  IGNORED_NODE,
  recursivelyRemoveSerializedNodes,
  serializeNodeWithId,
  transformAttribute,
} from '../rrweb-snapshot'
import { nodeOrAncestorsShouldBeHidden } from '../privacy'
import {
  AddedNodeMutation,
  AttributeCursor,
  MutationCallBack,
  MutationRecord,
  RemovedNodeMutation,
  TextCursor,
} from './types'
import { forEach, isAncestorRemoved, isIgnored } from './utils'

interface DoubleLinkedListNode {
  previous: DoubleLinkedListNode | null
  next: DoubleLinkedListNode | null
  value: NodeInLinkedList
}
export type NodeInLinkedList = Node & {
  __ln: DoubleLinkedListNode
}

function isNodeInLinkedList(n: Node | NodeInLinkedList): n is NodeInLinkedList {
  return '__ln' in n
}
class DoubleLinkedList {
  public length = 0
  public head: DoubleLinkedListNode | null = null

  public get(position: number) {
    if (position >= this.length) {
      throw new Error('Position outside of list range')
    }

    let current = this.head
    for (let index = 0; index < position; index += 1) {
      current = current?.next || null
    }
    return current
  }

  public addNode(n: Node) {
    const node: DoubleLinkedListNode = {
      next: null,
      previous: null,
      value: n as NodeInLinkedList,
    }
    /* eslint-disable no-underscore-dangle */
    ;(n as NodeInLinkedList).__ln = node
    if (n.previousSibling && isNodeInLinkedList(n.previousSibling)) {
      const current = n.previousSibling.__ln.next
      node.next = current
      node.previous = n.previousSibling.__ln
      n.previousSibling.__ln.next = node
      if (current) {
        current.previous = node
      }
    } else if (n.nextSibling && isNodeInLinkedList(n.nextSibling)) {
      const current = n.nextSibling.__ln.previous
      node.previous = current
      node.next = n.nextSibling.__ln
      n.nextSibling.__ln.previous = node
      /* eslint-enable no-underscore-dangle */
      if (current) {
        current.next = node
      }
    } else {
      if (this.head) {
        this.head.previous = node
      }
      node.next = this.head
      this.head = node
    }
    this.length += 1
  }

  public removeNode(n: NodeInLinkedList) {
    const current = n.__ln // eslint-disable-line no-underscore-dangle
    if (!this.head) {
      return
    }

    if (!current.previous) {
      this.head = current.next
      if (this.head) {
        this.head.previous = null
      }
    } else {
      current.previous.next = current.next
      if (current.next) {
        current.next.previous = current.previous
      }
    }
    /* eslint-disable no-underscore-dangle */
    if (n.__ln) {
      delete (n as any).__ln
    }
    /* eslint-enable no-underscore-dangle */
    this.length -= 1
  }
}

const moveKey = (id: number, parentId: number) => `${id}@${parentId}`

/**
 * Controls how mutations are processed, allowing to temporarily freeze the mutations process.
 */
export class MutationController {
  private frozen = false
  private unfreezeListener?: () => void
  private freezeListener?: () => void

  public freeze() {
    this.freezeListener?.()
    this.frozen = true
  }

  public unfreeze() {
    this.unfreezeListener?.()
    this.frozen = false
  }

  public isFrozen() {
    return this.frozen
  }

  public onFreeze(listener: () => void) {
    this.freezeListener = listener
  }

  public onUnfreeze(listener: () => void) {
    this.unfreezeListener = listener
  }
}

/**
 * Buffers and aggregate mutations generated by a MutationObserver into MutationCallbackParam
 */
export class MutationObserverWrapper {
  private observer: MutationObserver
  private texts: TextCursor[] = []
  private attributes: AttributeCursor[] = []
  private removes: RemovedNodeMutation[] = []
  private mapRemoves: Node[] = []

  private movedMap: Record<string, true> = {}

  /**
   * the browser MutationObserver emits multiple mutations after
   * a delay for performance reasons, making tracing added nodes hard
   * in our `processMutations` callback function.
   * For example, if we append an element el_1 into body, and then append
   * another element el_2 into el_1, these two mutations may be passed to the
   * callback function together when the two operations were done.
   * Generally we need to trace child nodes of newly added nodes, but in this
   * case if we count el_2 as el_1's child node in the first mutation record,
   * then we will count el_2 again in the second mutation record which was
   * duplicated.
   * To avoid of duplicate counting added nodes, we use a Set to store
   * added nodes and its child nodes during iterate mutation records. Then
   * collect added nodes from the Set which have no duplicate copy. But
   * this also causes newly added nodes will not be serialized with id ASAP,
   * which means all the id related calculation should be lazy too.
   */
  private addedSet = new Set<Node>()
  private movedSet = new Set<Node>()
  private droppedSet = new Set<Node>()

  public constructor(private controller: MutationController, private emissionCallback: MutationCallBack) {
    this.observer = new MutationObserver(monitor(this.processMutations))
    this.observer.observe(document, {
      attributeOldValue: true,
      attributes: true,
      characterData: true,
      characterDataOldValue: true,
      childList: true,
      subtree: true,
    })
    this.controller.onFreeze(() => this.processMutations(this.observer.takeRecords()))
    this.controller.onUnfreeze(this.emit)
  }

  public stop() {
    this.observer.disconnect()
  }

  private processMutations = (mutations: MutationRecord[]) => {
    mutations.forEach(this.processMutation)
    if (!this.controller.isFrozen()) {
      this.emit()
    }
  }

  private emit = () => {
    const adds: AddedNodeMutation[] = []

    /**
     * Sometimes child node may be pushed before its newly added
     * parent, so we init a queue to store these nodes.
     */
    const addList = new DoubleLinkedList()
    const getNextId = (n: Node): number | null => {
      let ns: Node | null = n
      let nextId: number | null = IGNORED_NODE
      while (nextId === IGNORED_NODE) {
        ns = ns && ns.nextSibling
        nextId = ns && getSerializedNodeId(ns)
      }
      if (nextId === -1 && nodeOrAncestorsShouldBeHidden(n.nextSibling)) {
        nextId = null
      }
      return nextId
    }
    const pushAdd = (n: Node) => {
      if (!n.parentNode) {
        return
      }
      const parentId = getSerializedNodeId(n.parentNode)
      const nextId = getNextId(n)
      if (parentId === -1 || nextId === -1) {
        return addList.addNode(n)
      }
      const sn = serializeNodeWithId(n, {
        doc: document,
        skipChild: true,
      })
      if (sn) {
        adds.push({
          nextId,
          parentId,
          node: sn,
        })
      }
    }

    this.movedSet.forEach((n) => {
      if (isParentRemoved(this.removes, n) && !this.movedSet.has(n.parentNode!)) {
        return
      }
      pushAdd(n)
    })

    this.addedSet.forEach((n) => {
      if (!isAncestorInSet(this.droppedSet, n) && !isParentRemoved(this.removes, n)) {
        pushAdd(n)
      } else if (isAncestorInSet(this.movedSet, n)) {
        pushAdd(n)
      } else {
        this.droppedSet.add(n)
      }
    })

    let candidate: DoubleLinkedListNode | null = null
    while (addList.length) {
      let node: DoubleLinkedListNode | null = null
      if (candidate) {
        const parentId = getSerializedNodeId(candidate.value.parentNode!)
        const nextId = getNextId(candidate.value)
        if (parentId !== -1 && nextId !== -1) {
          node = candidate
        }
      }
      if (!node) {
        for (let index = addList.length - 1; index >= 0; index -= 1) {
          const nodeCandidate = addList.get(index)!
          const parentId = getSerializedNodeId(nodeCandidate.value.parentNode!)
          const nextId = getNextId(nodeCandidate.value)
          if (parentId !== -1 && nextId !== -1) {
            node = nodeCandidate
            break
          }
        }
      }
      if (!node) {
        /**
         * If all nodes in queue could not find a serialized parent,
         * it may be a bug or corner case. We need to escape the
         * dead while loop at once.
         */
        break
      }
      candidate = node.previous
      addList.removeNode(node.value)
      pushAdd(node.value)
    }

    const payload = {
      adds,
      attributes: this.attributes
        .map((attribute) => ({
          attributes: attribute.attributes,
          id: getSerializedNodeId(attribute.node),
        }))
        // ignore mutations whose target node has been removed
        .filter((attribute) => attribute.id !== -1),
      removes: this.removes,
      texts: this.texts
        .map((text) => ({
          id: getSerializedNodeId(text.node),
          value: text.value,
        }))
        // ignore mutations whose target node has been removed
        .filter((text) => text.id !== -1),
    }

    while (this.mapRemoves.length) {
      recursivelyRemoveSerializedNodes(this.mapRemoves.shift()!)
    }

    // payload may be empty if the mutations happened in some blocked elements
    if (!payload.texts.length && !payload.attributes.length && !payload.removes.length && !payload.adds.length) {
      return
    }

    // reset
    this.texts = []
    this.attributes = []
    this.removes = []
    this.addedSet = new Set<Node>()
    this.movedSet = new Set<Node>()
    this.droppedSet = new Set<Node>()
    this.movedMap = {}

    this.emissionCallback(payload)
  }

  private processMutation = (m: MutationRecord) => {
    if (isIgnored(m.target)) {
      return
    }
    switch (m.type) {
      case 'characterData': {
        const value = m.target.textContent
        if (!nodeOrAncestorsShouldBeHidden(m.target) && value !== m.oldValue) {
          this.texts.push({
            value,
            node: m.target,
          })
        }
        break
      }
      case 'attributes': {
        const value = (m.target as HTMLElement).getAttribute(m.attributeName!)
        if (nodeOrAncestorsShouldBeHidden(m.target) || value === m.oldValue) {
          return
        }
        let item: AttributeCursor | undefined = this.attributes.find((a) => a.node === m.target)
        if (!item) {
          item = {
            attributes: {},
            node: m.target,
          }
          this.attributes.push(item)
        }
        // overwrite attribute if the mutations was triggered in same time
        item.attributes[m.attributeName!] = transformAttribute(document, m.attributeName!, value!)
        break
      }
      case 'childList': {
        forEach(m.addedNodes, (n: Node) => this.genAdds(n, m.target))
        forEach(m.removedNodes, (n: Node) => {
          const nodeId = getSerializedNodeId(n)
          const parentId = getSerializedNodeId(m.target)
          if (nodeOrAncestorsShouldBeHidden(n) || nodeOrAncestorsShouldBeHidden(m.target) || isIgnored(n)) {
            return
          }
          // removed node has not been serialized yet, just remove it from the Set
          if (this.addedSet.has(n)) {
            deepDelete(this.addedSet, n)
            this.droppedSet.add(n)
          } else if (this.addedSet.has(m.target) && nodeId === -1) {
            /**
             * If target was newly added and removed child node was not serialized, it means the
             * child node has been removed before callback fired, so we can ignore it because newly
             * added node will be serialized without child nodes.
             * TODO: verify this
             */
          } else if (isAncestorRemoved(m.target)) {
            /**
             * If parent id was not serialized any more, it means the parent node has already been
             * removed. So the node is also removed which we do not need to track and replay.
             */
          } else if (this.movedSet.has(n) && this.movedMap[moveKey(nodeId, parentId)]) {
            deepDelete(this.movedSet, n)
          } else {
            this.removes.push({
              parentId,
              id: nodeId,
            })
          }
          this.mapRemoves.push(n)
        })
        break
      }
      default:
        break
    }
  }

  private genAdds = (n: Node, target?: Node) => {
    if (nodeOrAncestorsShouldBeHidden(n)) {
      return
    }
    if (hasSerializedNode(n)) {
      if (isIgnored(n)) {
        return
      }
      this.movedSet.add(n)
      if (target) {
        const targetId = getSerializedNodeId(target)
        if (targetId !== -1) {
          this.movedMap[moveKey(getSerializedNodeId(n), targetId)] = true
        }
      }
    } else {
      this.addedSet.add(n)
      this.droppedSet.delete(n)
    }
    forEach(n.childNodes, (childN: ChildNode) => this.genAdds(childN))
  }
}

/**
 * Some utils to handle the mutation observer DOM records.
 * It should be more clear to extend the native data structure
 * like Set and Map, but currently Typescript does not support
 * that.
 */
function deepDelete(addsSet: Set<Node>, n: Node) {
  addsSet.delete(n)
  forEach(n.childNodes, (childN: ChildNode) => deepDelete(addsSet, childN))
}

function isParentRemoved(removes: RemovedNodeMutation[], n: Node): boolean {
  const { parentNode } = n
  if (!parentNode) {
    return false
  }
  const parentId = getSerializedNodeId(parentNode)
  if (removes.some((r) => r.id === parentId)) {
    return true
  }
  return isParentRemoved(removes, parentNode)
}

function isAncestorInSet(set: Set<Node>, n: Node): boolean {
  const { parentNode } = n
  if (!parentNode) {
    return false
  }
  if (set.has(parentNode)) {
    return true
  }
  return isAncestorInSet(set, parentNode)
}
