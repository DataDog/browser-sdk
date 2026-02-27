import type {
  AddedNodeMutation,
  AttributeMutation,
  BrowserFullSnapshotRecord,
  BrowserIncrementalSnapshotRecord,
  RemovedNodeMutation,
  TextMutation,
} from '../../../../types'
import { IncrementalSource, RecordType } from '../../../../types'
import type { NodeId, StyleSheetId } from '../../itemIds'
import type { MutationLog } from './mutationLog'
import { createMutationLog } from './mutationLog'
import { createV1RenderOptions } from './renderOptions'
import type { V1RenderOptions } from './renderOptions'
import { createVNode } from './vNode'
import type { VNode, VNodeData } from './vNode'
import { createVStyleSheet } from './vStyleSheet'
import type { VStyleSheet, VStyleSheetData } from './vStyleSheet'

export interface VDocument {
  createNode(data: VNodeData): VNode
  getNodeById(id: NodeId): VNode

  createStyleSheet(data: VStyleSheetData): VStyleSheet
  getStyleSheetById(id: StyleSheetId): VStyleSheet

  onAttributeChanged(node: VNode, name: string): void
  onNodeConnected(node: VNode, parent: VNode | undefined): void
  onNodeDisconnected(node: VNode, parent: VNode | undefined): void
  onTextChanged(node: VNode): void

  get mutations(): MutationLog

  naturalRendering(): BrowserFullSnapshotRecord['type'] | BrowserIncrementalSnapshotRecord['type']
  render(options?: Partial<V1RenderOptions>): BrowserFullSnapshotRecord | BrowserIncrementalSnapshotRecord
  renderAsFullSnaphot(options?: Partial<V1RenderOptions>): BrowserFullSnapshotRecord
  renderAsIncrementalSnapshot(options?: Partial<V1RenderOptions>): BrowserIncrementalSnapshotRecord

  root: VNode | undefined
}

export function createVDocument(): VDocument {
  const mutations = createMutationLog()

  let nextNodeId = 0 as NodeId
  const nodesById = new Map<NodeId, VNode>()
  let rootId: NodeId | undefined

  let nextStyleSheetId = 0 as StyleSheetId
  const styleSheetsById = new Map<StyleSheetId, VStyleSheet>()

  const self: VDocument = {
    createNode(data: VNodeData): VNode {
      const id = nextNodeId++ as NodeId
      const node = createVNode(self, id, data)
      nodesById.set(id, node)
      return node
    },

    getNodeById(id: NodeId): VNode {
      const node = nodesById.get(id)
      if (!node) {
        throw new Error(`Reference to unknown node: ${id}`)
      }
      return node
    },

    createStyleSheet(data: VStyleSheetData): VStyleSheet {
      const id = nextStyleSheetId++ as StyleSheetId
      const sheet = createVStyleSheet(self, id, data)
      styleSheetsById.set(id, sheet)
      return sheet
    },

    getStyleSheetById(id: StyleSheetId): VStyleSheet {
      const sheet = styleSheetsById.get(id)
      if (!sheet) {
        throw new Error(`Reference to unknown stylesheet: ${id}`)
      }
      return sheet
    },

    onAttributeChanged(node: VNode, name: string): void {
      mutations.onAttributeChanged(node.id, name)
    },

    onNodeConnected(node: VNode, parent: VNode | undefined): void {
      if (node.state !== 'new') {
        throw new Error(`Moving connected node: ${node.id}`)
      }

      if (parent === undefined) {
        if (rootId !== undefined) {
          throw new Error('Replacing existing root node')
        }
        rootId = node.id
      }

      node.state = 'connected'
      mutations.onNodeConnected(node.id)
    },

    onNodeDisconnected(node: VNode, parent: VNode | undefined): void {
      node.forSelfAndEachDescendant((descendant: VNode): void => {
        if (descendant.state === 'disconnected') {
          throw new Error(`Disconnecting node which isn't connected: ${descendant.id}`)
        }

        descendant.state = 'disconnected'
      })

      if (!parent) {
        throw new Error('Disconnecting the root node')
      }

      mutations.onNodeDisconnected(node.id, parent.id)
    },

    onTextChanged(node: VNode): void {
      mutations.onTextChanged(node.id)
    },

    get mutations(): MutationLog {
      return mutations
    },

    naturalRendering(): BrowserFullSnapshotRecord['type'] | BrowserIncrementalSnapshotRecord['type'] {
      if (rootId !== undefined && mutations.nodeAdds.has(rootId)) {
        return RecordType.FullSnapshot
      }
      return RecordType.IncrementalSnapshot
    },

    render(options?: Partial<V1RenderOptions>): BrowserFullSnapshotRecord | BrowserIncrementalSnapshotRecord {
      if (self.naturalRendering() === RecordType.FullSnapshot) {
        return self.renderAsFullSnaphot(options)
      }
      return self.renderAsIncrementalSnapshot(options)
    },

    renderAsFullSnaphot(renderOptions: Partial<V1RenderOptions> = {}): BrowserFullSnapshotRecord {
      const options = createV1RenderOptions(renderOptions)

      const root = self.root
      if (!root) {
        throw new Error('No root node found')
      }

      let scrollLeft = 0
      let scrollTop = 0
      if (root.data.kind === '#document' || root.data.kind === '#element') {
        scrollLeft = root.data.scrollLeft ?? 0
        scrollTop = root.data.scrollTop ?? 0
      }

      return {
        data: {
          node: root.render(options),
          initialOffset: { left: scrollLeft, top: scrollTop },
        },
        type: RecordType.FullSnapshot,
        timestamp: options.timestamp,
      }
    },

    renderAsIncrementalSnapshot(renderOptions: Partial<V1RenderOptions> = {}): BrowserIncrementalSnapshotRecord {
      const options = createV1RenderOptions(renderOptions)

      const root = self.root
      if (!root) {
        throw new Error('No root node found')
      }

      const remappedId = (id: NodeId): NodeId => options.nodeIdRemapper.remap(id)

      const addMutations: AddedNodeMutation[] = []
      root.forEachAddedNodeRoot(mutations.nodeAdds, (node) => {
        if (!node.parent) {
          throw new Error(`Can't render incremental add of root node ${node.id}`)
        }
        addMutations.push({
          nextId: node.nextSibling?.id !== undefined ? remappedId(node.nextSibling.id) : null,
          parentId: remappedId(node.parent.id),
          node: node.render(options),
        })
      })

      const removeMutations: RemovedNodeMutation[] = []
      for (const [id, parentId] of mutations.nodeRemoves) {
        removeMutations.push({ parentId: remappedId(parentId), id: remappedId(id) })
      }

      const textMutations: TextMutation[] = []
      for (const id of mutations.textChanges) {
        const node = self.getNodeById(id)
        if (node.data.kind !== '#text') {
          throw new Error(`Can't render incremental text mutation of ${node.data.kind} node ${id}`)
        }
        textMutations.push({ id: remappedId(id), value: node.data.textContent })
      }

      const attributeMutations: AttributeMutation[] = []
      for (const [id, attrNames] of mutations.attributeChanges) {
        const node = self.getNodeById(id)
        if (node.data.kind !== '#element') {
          throw new Error(`Can't render incremental attribute mutation of ${node.data.kind} node ${id}`)
        }

        const attributes: Record<string, string | null> = {}
        for (const attrName of attrNames) {
          attributes[attrName] = node.data.attributes[attrName] ?? null
        }

        attributeMutations.push({ id: remappedId(id), attributes })
      }

      return {
        data: {
          source: IncrementalSource.Mutation,
          adds: addMutations,
          removes: removeMutations,
          texts: textMutations,
          attributes: attributeMutations,
        },
        type: RecordType.IncrementalSnapshot,
        timestamp: options.timestamp,
      }
    },

    get root(): VNode | undefined {
      return rootId === undefined ? undefined : self.getNodeById(rootId)
    },
    set root(node: VNode) {
      self.onNodeConnected(node, undefined)
    },
  }

  return self
}
