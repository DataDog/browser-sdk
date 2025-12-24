import type {
  AddDocTypeNodeChange,
  AddElementNodeChange,
  AddNodeChange,
  AddStyleSheetChange,
  AddTextNodeChange,
  AttachedStyleSheetsChange,
  BrowserChangeRecord,
  BrowserFullSnapshotRecord,
  MediaPlaybackStateChange,
  ScrollPositionChange,
  SerializedNodeWithId,
  SizeChange,
  StyleSheet,
} from '../../../types'
import { ChangeType, NodeType, PlaybackState, RecordType } from '../../../types'
import type { NodeId, StringId, StyleSheetId } from '../itemIds'

export function convertChangeToFullSnapshot(record: BrowserChangeRecord): BrowserFullSnapshotRecord {
  const nodeTracker = createNodeTracker()
  const stringTracker = createStringTracker()
  const sheetTracker = createStyleSheetTracker()

  for (const change of record.data) {
    switch (change[0]) {
      case ChangeType.AddString: {
        for (let i = 1; i < change.length; i++) {
          stringTracker.add(change[i] as string)
        }
        break
      }

      case ChangeType.AddNode: {
        for (let i = 1; i < change.length; i++) {
          convertAddNodeChange(change[i] as AddNodeChange, nodeTracker, stringTracker)
        }
        break
      }

      case ChangeType.ScrollPosition: {
        for (let i = 1; i < change.length; i++) {
          convertScrollPositionChange(change[i] as ScrollPositionChange, nodeTracker)
        }
        break
      }

      case ChangeType.Size: {
        for (let i = 1; i < change.length; i++) {
          convertSizeChange(change[i] as SizeChange, nodeTracker)
        }
        break
      }

      case ChangeType.AddStyleSheet: {
        for (let i = 1; i < change.length; i++) {
          convertAddStyleSheetChange(change[i] as AddStyleSheetChange, sheetTracker, stringTracker)
        }
        break
      }

      case ChangeType.AttachedStyleSheets: {
        for (let i = 1; i < change.length; i++) {
          convertAttachedStyleSheetsChange(change[i] as AttachedStyleSheetsChange, nodeTracker, sheetTracker)
        }
        break
      }

      case ChangeType.MediaPlaybackState: {
        for (let i = 1; i < change.length; i++) {
          convertMediaPlaybackStateChange(change[i] as MediaPlaybackStateChange, nodeTracker)
        }
        break
      }
    }
  }

  const node = nodeTracker.getRoot()
  const initialOffset = nodeTracker.getRootScrollPosition()

  if (!node) {
    throw new Error('No root node found')
  }

  return {
    data: { node, initialOffset },
    type: RecordType.FullSnapshot,
    timestamp: record.timestamp,
  }
}

type SerializedNodeWithChildren = SerializedNodeWithId & { childNodes: SerializedNodeWithId[] }

interface NodeTracker {
  add(nodeId: NodeId, node: SerializedNodeWithId): void
  get(nodeId: NodeId): SerializedNodeWithChildren
  getParent(nodeId: NodeId): SerializedNodeWithChildren
  setParent(nodeId: NodeId, node: SerializedNodeWithChildren): void
  getRoot(): SerializedNodeWithChildren | undefined
  setRoot(node: SerializedNodeWithId): void
  getRootScrollPosition(): { left: number; top: number }
  setRootScrollPosition(position: { left: number; top: number }): void
  nextId(): NodeId
}

function createNodeTracker(): NodeTracker {
  const nodes = new Map<NodeId, SerializedNodeWithChildren>()
  const nodeParents = new Map<NodeId, SerializedNodeWithChildren>()
  let rootNode: SerializedNodeWithChildren | undefined
  let rootScrollPosition = { left: 0, top: 0 }
  return {
    add(nodeId: NodeId, node: SerializedNodeWithId): void {
      nodes.set(nodeId, node as SerializedNodeWithChildren)
    },
    get(nodeId: NodeId): SerializedNodeWithChildren {
      const node = nodes.get(nodeId)
      if (!node) {
        throw new Error(`Reference to unknown node: ${nodeId}`)
      }
      return node
    },
    getParent(nodeId: NodeId): SerializedNodeWithChildren {
      const parent = nodeParents.get(nodeId)
      if (!parent) {
        throw new Error(`Reference to unknown parent of node: ${nodeId}`)
      }
      return parent
    },
    setParent(nodeId: NodeId, node: SerializedNodeWithChildren): void {
      nodeParents.set(nodeId, node)
    },
    getRoot(): SerializedNodeWithChildren | undefined {
      return rootNode
    },
    setRoot(node: SerializedNodeWithId): void {
      rootNode = node as SerializedNodeWithChildren
    },
    getRootScrollPosition(): { left: number; top: number } {
      return rootScrollPosition
    },
    setRootScrollPosition(position: { left: number; top: number }): void {
      rootScrollPosition = position
    },
    nextId(): NodeId {
      return nodes.size as NodeId
    },
  }
}

interface StringTracker {
  add(newString: string): void
  get(stringOrStringId: number | string): string
}

function createStringTracker(): StringTracker {
  const strings = new Map<StringId, string>()
  return {
    add(newString: string): void {
      strings.set(strings.size as StringId, newString)
    },
    get(stringOrStringId: number | string): string {
      if (typeof stringOrStringId === 'string') {
        return stringOrStringId
      }
      const referencedString = strings.get(stringOrStringId as StringId)
      if (referencedString === undefined) {
        throw new Error(`Reference to unknown string: ${stringOrStringId}`)
      }
      return referencedString
    },
  }
}

interface StyleSheetData {
  rules: string | string[]
  mediaList: string[]
  disabled: boolean
}

interface StyleSheetTracker {
  add(data: StyleSheetData): void
  get(sheetId: number): StyleSheetData
}

function createStyleSheetTracker(): StyleSheetTracker {
  const styleSheets = new Map<StyleSheetId, StyleSheetData>()
  return {
    add(data: StyleSheetData): void {
      styleSheets.set(styleSheets.size as StyleSheetId, data)
    },
    get(sheetId: StyleSheetId): StyleSheetData {
      const styleSheet = styleSheets.get(sheetId)
      if (!styleSheet) {
        throw new Error(`Reference to unknown stylesheet: ${sheetId}`)
      }
      return styleSheet
    },
  }
}

function convertAddNodeChange(addedNode: AddNodeChange, nodeTracker: NodeTracker, stringTracker: StringTracker): void {
  const id = nodeTracker.nextId()
  const nodeName = stringTracker.get(addedNode[1])

  let node: SerializedNodeWithId
  switch (nodeName) {
    case '#cdata-section':
      node = {
        type: NodeType.CDATA,
        id,
        textContent: '',
      }
      break

    case '#document':
      node = {
        type: NodeType.Document,
        id,
        childNodes: [],
        adoptedStyleSheets: undefined,
      }
      break

    case '#document-fragment':
      node = {
        type: NodeType.DocumentFragment,
        id,
        childNodes: [],
        isShadowRoot: false,
        adoptedStyleSheets: undefined,
      }
      break

    case '#doctype': {
      const [, , name, publicId, systemId] = addedNode as AddDocTypeNodeChange
      node = {
        type: NodeType.DocumentType,
        id,
        name: stringTracker.get(name),
        publicId: stringTracker.get(publicId),
        systemId: stringTracker.get(systemId),
      }
      break
    }

    case '#shadow-root':
      node = {
        type: NodeType.DocumentFragment,
        id,
        childNodes: [],
        isShadowRoot: true,
        adoptedStyleSheets: undefined,
      }
      break

    case '#text': {
      const [, , textContent] = addedNode as AddTextNodeChange
      node = {
        type: NodeType.Text,
        id,
        textContent: stringTracker.get(textContent),
      }
      break
    }

    default: {
      let tagName: string
      let isSVG: true | undefined
      if (nodeName.startsWith('svg>')) {
        tagName = nodeName.substring(4)
        isSVG = true
      } else {
        tagName = nodeName.toLowerCase()
      }

      const [, , ...attributeAssignments] = addedNode as AddElementNodeChange
      const attributes: Record<string, string> = {}
      for (const [name, value] of attributeAssignments) {
        attributes[stringTracker.get(name)] = stringTracker.get(value)
      }

      node = {
        type: NodeType.Element,
        id,
        tagName,
        attributes,
        childNodes: [],
        isSVG,
      }
      break
    }
  }

  nodeTracker.add(id, node)

  const insertionPoint = addedNode[0]
  if (insertionPoint === null) {
    // Insert as the root node.
    nodeTracker.setRoot(node)
  } else if (insertionPoint === 0) {
    // Insert as the next sibling of the previous node.
    const parent = nodeTracker.getParent((id - 1) as NodeId)
    nodeTracker.setParent(id, parent)
    parent.childNodes.push(node)
  } else if (insertionPoint > 0) {
    // Insert via the equivalent of appendChild().
    const parent = nodeTracker.get((id - insertionPoint) as NodeId)
    nodeTracker.setParent(id, parent)
    parent.childNodes.push(node)
  } else {
    // Insert via the equivalent of after().
    const referenceId = (id + insertionPoint) as NodeId
    const reference = nodeTracker.get(referenceId)
    const parent = nodeTracker.getParent(referenceId)
    nodeTracker.setParent(id, parent)
    parent.childNodes.splice(parent.childNodes.indexOf(reference), 0, node)
  }
}

function convertAddStyleSheetChange(
  change: AddStyleSheetChange,
  sheetTracker: StyleSheetTracker,
  stringTracker: StringTracker
): void {
  const [encodedRules, encodedMediaList = [], disabled = false] = change
  const rules: string | string[] = Array.isArray(encodedRules)
    ? encodedRules.map((rule) => stringTracker.get(rule))
    : stringTracker.get(encodedRules)
  const mediaList = encodedMediaList.map((item) => stringTracker.get(item))
  sheetTracker.add({ rules, mediaList, disabled })
}

function convertAttachedStyleSheetsChange(
  change: AttachedStyleSheetsChange,
  nodeTracker: NodeTracker,
  sheetTracker: StyleSheetTracker
): void {
  const [nodeId, ...styleSheetIds] = change
  const node = nodeTracker.get(nodeId as NodeId)
  switch (node.type) {
    case NodeType.Document:
    case NodeType.DocumentFragment: {
      const styleSheets: StyleSheet[] = []
      for (const styleSheetId of styleSheetIds) {
        const styleSheet = sheetTracker.get(styleSheetId as StyleSheetId)
        if (!Array.isArray(styleSheet.rules)) {
          throw new Error(`Stylesheet ${styleSheetId} is encoded in the wrong format for attachedStyleSheets`)
        }
        styleSheets.push({
          cssRules: styleSheet.rules,
          media: styleSheet.mediaList.length > 0 ? styleSheet.mediaList : undefined,
          disabled: styleSheet.disabled ? true : undefined,
        })
      }
      ;(node.adoptedStyleSheets as unknown as StyleSheet[]) = styleSheets
      break
    }

    case NodeType.Element: {
      const cssTextBlocks: string[] = []
      for (const styleSheetId of styleSheetIds) {
        const styleSheet = sheetTracker.get(styleSheetId as StyleSheetId)
        if (Array.isArray(styleSheet.rules)) {
          for (const rule of styleSheet.rules) {
            cssTextBlocks.push(rule)
          }
        } else {
          cssTextBlocks.push(styleSheet.rules)
        }
      }
      node.attributes._cssText = cssTextBlocks.join('')
      break
    }
  }
}

function convertScrollPositionChange(change: ScrollPositionChange, nodeTracker: NodeTracker): void {
  const [nodeId, left, top] = change
  const node = nodeTracker.get(nodeId as NodeId)
  if (node === nodeTracker.getRoot()) {
    nodeTracker.setRootScrollPosition({ left, top })
  }
  if (node.type === NodeType.Element) {
    node.attributes.rr_scrollLeft = left
    node.attributes.rr_scrollTop = top
  }
}

function convertSizeChange(change: SizeChange, nodeTracker: NodeTracker): void {
  const [nodeId, width, height] = change
  const node = nodeTracker.get(nodeId as NodeId)
  if (node.type !== NodeType.Element) {
    throw new Error(`Got size change for node ${nodeId} with non-element type ${node.type}`)
  }
  node.attributes = {
    rr_width: `${width}px`,
    rr_height: `${height}px`,
    ...node.attributes,
  }
}

function convertMediaPlaybackStateChange(change: MediaPlaybackStateChange, nodeTracker: NodeTracker): void {
  const [nodeId, playbackState] = change
  const node = nodeTracker.get(nodeId as NodeId)
  if (node.type !== NodeType.Element) {
    throw new Error(`Got media playback state change for node ${nodeId} with non-element type ${node.type}`)
  }
  node.attributes.rr_mediaState = playbackState === PlaybackState.Playing ? 'played' : 'paused'
}
