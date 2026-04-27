import type { SerializedNodeWithId } from '../../../../types'
import { PlaybackState, NodeType } from '../../../../types'
import type { NodeId } from '../../itemIds'
import type { V1RenderOptions } from './renderOptions'
import type { VDocument } from './vDocument'
import type { VStyleSheet } from './vStyleSheet'

export interface VNode {
  after(node: VNode): void
  appendChild(node: VNode): void
  before(node: VNode): void
  remove(): void

  setAttachedStyleSheets(sheets: VStyleSheet[]): void
  setAttribute(name: string, value: string | null): void
  setPlaybackState(state: PlaybackState): void
  setScrollPosition(left: number, top: number): void
  setSize(width: number, height: number): void
  setTextContent(value: string): void

  forEachAddedNodeRoot(nodeAdds: Set<NodeId>, action: (node: VNode) => void): void
  forSelfAndEachDescendant(action: (node: VNode) => void): void
  mapChildren<Result>(action: (node: VNode) => Result): Result[]

  render(options: V1RenderOptions): SerializedNodeWithId

  get data(): VNodeData
  get id(): NodeId
  get ownerDocument(): VDocument

  state: VNodeState
  firstChild: VNode | undefined
  lastChild: VNode | undefined
  previousSibling: VNode | undefined
  nextSibling: VNode | undefined
  parent: VNode | undefined
}

export type VNodeState = 'new' | 'connected' | 'disconnected'

export type VNodeData =
  | {
      kind: '#cdata-section'
    }
  | {
      kind: '#document'
      attachedStyleSheets?: VStyleSheet[] | undefined
      scrollLeft?: number
      scrollTop?: number
    }
  | {
      kind: '#doctype'
      name: string
      publicId: string
      systemId: string
    }
  | {
      kind: '#document-fragment'
      attachedStyleSheets?: VStyleSheet[] | undefined
    }
  | {
      kind: '#element'
      tag: string
      attachedStyleSheets?: VStyleSheet[] | undefined
      attributes: Record<string, string>
      isSVG?: boolean
      playbackState?: PlaybackState
      scrollLeft?: number
      scrollTop?: number
      width?: number
      height?: number
    }
  | {
      kind: '#shadow-root'
      attachedStyleSheets?: VStyleSheet[] | undefined
    }
  | {
      kind: '#text'
      textContent: string
    }

export function createVNode(document: VDocument, id: NodeId, data: VNodeData): VNode {
  let state: VNodeState = 'new'

  const assertConnectedCorrectly = (): void => {
    if (self.state !== 'connected') {
      throw new Error(`Expected node ${self.id} to be connected, not ${self.state}`)
    }

    for (const connection of ['firstChild', 'lastChild', 'previousSibling', 'nextSibling', 'parent'] as const) {
      const connectedNode = self[connection]
      if (connectedNode && connectedNode.state !== 'connected') {
        throw new Error(`Expected node ${self.id}'s ${connection} to be connected, not ${connectedNode.state}`)
      }
    }
  }

  const self: VNode = {
    after(node: VNode): void {
      node.parent = self.parent
      node.previousSibling = self

      if (self.nextSibling) {
        self.nextSibling.previousSibling = node
      }
      node.nextSibling = self.nextSibling
      self.nextSibling = node

      if (self.parent?.lastChild === self) {
        self.parent.lastChild = node
      }

      document.onNodeConnected(node, self.parent)
      assertConnectedCorrectly()
    },

    appendChild(node: VNode): void {
      if (self.lastChild) {
        self.lastChild.after(node)
        return
      }

      node.parent = self
      self.firstChild = node
      self.lastChild = node

      document.onNodeConnected(node, self)
      assertConnectedCorrectly()
    },

    before(node: VNode): void {
      node.parent = self.parent
      node.nextSibling = self

      if (self.previousSibling) {
        self.previousSibling.nextSibling = node
      }
      node.previousSibling = self.previousSibling
      self.previousSibling = node

      if (self.parent?.firstChild === self) {
        self.parent.firstChild = node
      }

      document.onNodeConnected(node, self.parent)
      assertConnectedCorrectly()
    },

    remove(): void {
      if (self.state === 'disconnected') {
        return // This is a redundant remove.
      }

      if (self.parent?.firstChild === self) {
        self.parent.firstChild = self.nextSibling
      }
      if (self.parent?.lastChild === self) {
        self.parent.lastChild = self.previousSibling
      }
      if (self.previousSibling) {
        self.previousSibling.nextSibling = self.nextSibling
      }
      if (self.nextSibling) {
        self.nextSibling.previousSibling = self.previousSibling
      }

      const parent = self.parent
      self.parent = undefined
      self.previousSibling = undefined
      self.nextSibling = undefined

      document.onNodeDisconnected(self, parent)
    },

    setAttachedStyleSheets(sheets: VStyleSheet[]): void {
      assertConnectedCorrectly()

      switch (data.kind) {
        case '#document':
        case '#document-fragment':
        case '#element':
        case '#shadow-root':
          data.attachedStyleSheets = sheets
          break

        default:
          throw new Error(`Cannot attach stylesheets to ${data.kind} node ${id}`)
      }
    },

    setAttribute(name: string, value: string | null): void {
      assertConnectedCorrectly()

      if (data.kind !== '#element') {
        throw new Error(`Cannot set attribute ${name} on ${data.kind} node ${id}`)
      }

      if (value === null) {
        delete data.attributes[name]
      } else {
        data.attributes[name] = value
      }

      document.onAttributeChanged(self, name)
    },

    setPlaybackState(state: PlaybackState): void {
      assertConnectedCorrectly()

      if (data.kind !== '#element') {
        throw new Error(`Cannot set media playback state of ${data.kind} node ${id}`)
      }

      data.playbackState = state
    },

    setScrollPosition(left: number, top: number): void {
      assertConnectedCorrectly()

      if (data.kind !== '#document' && data.kind !== '#element') {
        throw new Error(`Cannot set scroll position on ${data.kind} node ${id}`)
      }

      // Treat zero coordinates as 'not scrolled' unless this element has scrolled in the past.
      if (left !== 0 || data.scrollLeft !== undefined) {
        data.scrollLeft = left
      }
      if (top !== 0 || data.scrollTop !== undefined) {
        data.scrollTop = top
      }
    },

    setSize(width: number, height: number): void {
      assertConnectedCorrectly()

      if (data.kind !== '#element') {
        throw new Error(`Cannot set size of ${data.kind} node ${id}`)
      }

      data.width = width
      data.height = height
    },

    setTextContent(value: string): void {
      assertConnectedCorrectly()

      if (data.kind !== '#text') {
        throw new Error(`Cannot set text on ${data.kind} node ${id}`)
      }

      data.textContent = value

      document.onTextChanged(self)
    },

    forEachAddedNodeRoot(nodeAdds: Set<NodeId>, action: (node: VNode) => void): void {
      if (nodeAdds.has(id)) {
        // This is the root of a newly-added subtree.
        action(self)
        return
      }

      // This is an existing node, but there may be new nodes among our descendants. Visit
      // children in reverse order to match the ordering that the V1 serialization
      // algorithm would use.
      for (let child = self.lastChild; child; child = child.previousSibling) {
        child.forEachAddedNodeRoot(nodeAdds, action)
      }
    },

    forSelfAndEachDescendant(action: (node: VNode) => void): void {
      action(self)
      for (let child = self.firstChild; child; child = child.nextSibling) {
        child.forSelfAndEachDescendant(action)
      }
    },

    mapChildren<Result>(action: (node: VNode) => Result): Result[] {
      const results: Result[] = []
      for (let child = self.firstChild; child; child = child.nextSibling) {
        results.push(action(child))
      }
      return results
    },

    render(options: V1RenderOptions): SerializedNodeWithId {
      assertConnectedCorrectly()

      const id = options.nodeIdRemapper?.remap(self.id) ?? self.id

      switch (data.kind) {
        case '#cdata-section':
          return {
            type: NodeType.CDATA,
            id,
            textContent: '',
          }

        case '#doctype':
          return {
            type: NodeType.DocumentType,
            id,
            name: data.name,
            publicId: data.publicId,
            systemId: data.systemId,
          }

        case '#document':
          return {
            type: NodeType.Document,
            id,
            childNodes: self.mapChildren((node) => node.render(options)),
            adoptedStyleSheets: data.attachedStyleSheets?.map((sheet) => sheet.renderAsAdoptedStyleSheet()),
          }

        case '#document-fragment':
          return {
            type: NodeType.DocumentFragment,
            id,
            childNodes: self.mapChildren((node) => node.render(options)),
            adoptedStyleSheets: data.attachedStyleSheets?.map((sheet) => sheet.renderAsAdoptedStyleSheet()),
            isShadowRoot: false,
          }

        case '#element': {
          const attributes: Record<string, string | number> = {}

          // Add size-related virtual attributes before the real DOM attributes, to match
          // the ordering used in the V1 format.
          if (data.width !== undefined && data.height !== undefined) {
            attributes.rr_width = `${data.width}px`
            attributes.rr_height = `${data.height}px`
          }

          // Add DOM attributes.
          Object.assign(attributes, data.attributes)

          // Add other virtual attributes after the real DOM attributes, to match the
          // ordering used in the V1 format.
          if (data.attachedStyleSheets !== undefined) {
            attributes._cssText = data.attachedStyleSheets.map((sheet) => sheet.renderAsCssText()).join('')
          }
          if (data.playbackState !== undefined) {
            attributes.rr_mediaState = data.playbackState === PlaybackState.Paused ? 'paused' : 'played'
          }
          if (data.scrollLeft) {
            attributes.rr_scrollLeft = data.scrollLeft
          }
          if (data.scrollTop) {
            attributes.rr_scrollTop = data.scrollTop
          }

          return {
            type: NodeType.Element,
            id,
            tagName: data.tag,
            attributes,
            childNodes: self.mapChildren((node) => node.render(options)),
            isSVG: data.isSVG === true ? true : undefined,
          }
        }

        case '#shadow-root':
          return {
            type: NodeType.DocumentFragment,
            id,
            childNodes: self.mapChildren((node) => node.render(options)),
            adoptedStyleSheets: data.attachedStyleSheets?.map((sheet) => sheet.renderAsAdoptedStyleSheet()),
            isShadowRoot: true,
          }

        case '#text':
          return {
            type: NodeType.Text,
            id,
            textContent: data.textContent,
          }

        default:
          data satisfies never
          throw new Error(`Rendering not implemented for ${self.data.kind} node ${id}`)
      }
    },

    get data(): VNodeData {
      return data
    },
    get ownerDocument(): VDocument {
      return document
    },
    get id(): NodeId {
      return id
    },

    get state(): VNodeState {
      return state
    },
    set state(value: VNodeState) {
      if (
        (state === 'new' && value !== 'connected') ||
        (state === 'connected' && value !== 'disconnected') ||
        state === 'disconnected'
      ) {
        throw new Error(`Invalid state transition from ${state} to ${value}`)
      }
      state = value
    },

    firstChild: undefined,
    lastChild: undefined,
    previousSibling: undefined,
    nextSibling: undefined,
    parent: undefined,
  }

  return self
}
