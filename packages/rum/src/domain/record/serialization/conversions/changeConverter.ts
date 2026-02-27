import type {
  AddDocTypeNodeChange,
  AddElementNodeChange,
  AddNodeChange,
  AddStyleSheetChange,
  AddTextNodeChange,
  AttachedStyleSheetsChange,
  AttributeChange,
  BrowserChangeRecord,
  BrowserFullSnapshotRecord,
  BrowserIncrementalSnapshotRecord,
  MediaPlaybackStateChange,
  RemoveNodeChange,
  ScrollPositionChange,
  SizeChange,
  TextChange,
} from '../../../../types'
import { ChangeType } from '../../../../types'
import type { NodeId, StyleSheetId } from '../../itemIds'
import type { V1RenderOptions } from './renderOptions'
import type { StringTable } from './stringTable'
import { createStringTable } from './stringTable'
import type { VDocument } from './vDocument'
import { createVDocument } from './vDocument'
import type { VNode } from './vNode'

export interface ChangeConverter {
  convert(
    record: BrowserChangeRecord,
    options?: Partial<V1RenderOptions>
  ): BrowserFullSnapshotRecord | BrowserIncrementalSnapshotRecord

  document: VDocument
  stringTable: StringTable
}

export function createChangeConverter(): ChangeConverter {
  const self: ChangeConverter = {
    convert(
      record: BrowserChangeRecord,
      options: Partial<V1RenderOptions> = {}
    ): BrowserFullSnapshotRecord | BrowserIncrementalSnapshotRecord {
      applyChangeToVDOM(record, self.document, self.stringTable)
      return self.document.render({ timestamp: record.timestamp, ...options })
    },

    document: createVDocument(),
    stringTable: createStringTable(),
  }

  return self
}

function applyChangeToVDOM(record: BrowserChangeRecord, document: VDocument, stringTable: StringTable): void {
  document.mutations.clear()

  for (const change of record.data) {
    switch (change[0]) {
      case ChangeType.AddString: {
        for (let i = 1; i < change.length; i++) {
          stringTable.add(change[i] as string)
        }
        break
      }

      case ChangeType.AddNode: {
        for (let i = 1; i < change.length; i++) {
          applyAddNodeChange(change[i] as AddNodeChange, document, stringTable)
        }
        break
      }

      case ChangeType.RemoveNode: {
        for (let i = 1; i < change.length; i++) {
          applyRemoveNodeChange(change[i], document)
        }
        break
      }

      case ChangeType.Attribute: {
        for (let i = 1; i < change.length; i++) {
          applyAttributeChange(change[i] as AttributeChange, document, stringTable)
        }
        break
      }

      case ChangeType.Text: {
        for (let i = 1; i < change.length; i++) {
          applyTextChange(change[i] as TextChange, document, stringTable)
        }
        break
      }

      case ChangeType.ScrollPosition: {
        for (let i = 1; i < change.length; i++) {
          applyScrollPositionChange(change[i] as ScrollPositionChange, document)
        }
        break
      }

      case ChangeType.Size: {
        for (let i = 1; i < change.length; i++) {
          applySizeChange(change[i] as SizeChange, document)
        }
        break
      }

      case ChangeType.AddStyleSheet: {
        for (let i = 1; i < change.length; i++) {
          applyAddStyleSheetChange(change[i] as AddStyleSheetChange, document, stringTable)
        }
        break
      }

      case ChangeType.AttachedStyleSheets: {
        for (let i = 1; i < change.length; i++) {
          applyAttachedStyleSheetsChange(change[i] as AttachedStyleSheetsChange, document)
        }
        break
      }

      case ChangeType.MediaPlaybackState: {
        for (let i = 1; i < change.length; i++) {
          applyMediaPlaybackStateChange(change[i] as MediaPlaybackStateChange, document)
        }
        break
      }
    }
  }
}

function applyAddNodeChange(addedNode: AddNodeChange, document: VDocument, stringTable: StringTable): void {
  const nodeName = stringTable.decode(addedNode[1])

  let node: VNode
  switch (nodeName) {
    case '#cdata-section':
      node = document.createNode({ kind: '#cdata-section' })
      break

    case '#doctype': {
      const [, , name, publicId, systemId] = addedNode as AddDocTypeNodeChange
      node = document.createNode({
        kind: '#doctype',
        name: stringTable.decode(name),
        publicId: stringTable.decode(publicId),
        systemId: stringTable.decode(systemId),
      })
      break
    }

    case '#document':
      node = document.createNode({ kind: '#document' })
      break

    case '#document-fragment':
      node = document.createNode({ kind: '#document-fragment' })
      break

    case '#shadow-root':
      node = document.createNode({ kind: '#shadow-root' })
      break

    case '#text': {
      const [, , textContent] = addedNode as AddTextNodeChange
      node = document.createNode({
        kind: '#text',
        textContent: stringTable.decode(textContent),
      })
      break
    }

    default: {
      let tagName: string
      let isSVG = false
      if (nodeName.startsWith('svg>')) {
        tagName = nodeName.substring(4).toLowerCase()
        isSVG = true
      } else {
        tagName = nodeName.toLowerCase()
      }

      const [, , ...attributeAssignments] = addedNode as AddElementNodeChange
      const attributes: Record<string, string> = {}
      for (const [name, value] of attributeAssignments) {
        attributes[stringTable.decode(name)] = stringTable.decode(value)
      }

      node = document.createNode({ kind: '#element', tag: tagName, attributes, isSVG })
      break
    }
  }

  const insertionPoint = addedNode[0]
  if (insertionPoint === null) {
    document.root = node
  } else if (insertionPoint === 0) {
    const previousSiblingId = (node.id - 1) as NodeId
    const previousSibling = document.getNodeById(previousSiblingId)
    previousSibling.after(node)
  } else if (insertionPoint > 0) {
    const parentId = (node.id - insertionPoint) as NodeId
    const parent = document.getNodeById(parentId)
    parent.appendChild(node)
  } else {
    const nextSiblingId = (node.id + insertionPoint) as NodeId
    const nextSibling = document.getNodeById(nextSiblingId)
    nextSibling.before(node)
  }
}

function applyAddStyleSheetChange(change: AddStyleSheetChange, document: VDocument, stringTable: StringTable): void {
  const [encodedRules, encodedMediaList = [], disabled = false] = change
  const rules: string | string[] = Array.isArray(encodedRules)
    ? encodedRules.map((rule) => stringTable.decode(rule))
    : stringTable.decode(encodedRules)
  const mediaList = encodedMediaList.map((item) => stringTable.decode(item))
  document.createStyleSheet({ rules, mediaList, disabled })
}

function applyAttachedStyleSheetsChange(change: AttachedStyleSheetsChange, document: VDocument): void {
  const [nodeId, ...sheetIds] = change
  const node = document.getNodeById(nodeId as NodeId)
  node.setAttachedStyleSheets(sheetIds.map((sheetId) => document.getStyleSheetById(sheetId as StyleSheetId)))
}

function applyAttributeChange(change: AttributeChange, document: VDocument, stringTable: StringTable): void {
  const [nodeId, ...attributeMutations] = change
  const node = document.getNodeById(nodeId as NodeId)
  for (const [nameOrId, valueOrId = null] of attributeMutations) {
    const name = stringTable.decode(nameOrId)
    if (valueOrId === null) {
      node.setAttribute(name, null)
    } else {
      const value = stringTable.decode(valueOrId)
      node.setAttribute(name, value)
    }
  }
}

function applyMediaPlaybackStateChange(change: MediaPlaybackStateChange, document: VDocument): void {
  const [nodeId, playbackState] = change
  const node = document.getNodeById(nodeId as NodeId)
  node.setPlaybackState(playbackState)
}

function applyRemoveNodeChange(change: RemoveNodeChange, document: VDocument): void {
  const nodeId = change as NodeId
  const node = document.getNodeById(nodeId)
  node.remove()
}

function applyScrollPositionChange(change: ScrollPositionChange, document: VDocument): void {
  const [nodeId, left, top] = change
  const node = document.getNodeById(nodeId as NodeId)
  node.setScrollPosition(left, top)
}

function applySizeChange(change: SizeChange, document: VDocument): void {
  const [nodeId, width, height] = change
  const node = document.getNodeById(nodeId as NodeId)
  node.setSize(width, height)
}

function applyTextChange(change: TextChange, document: VDocument, stringTable: StringTable): void {
  const [nodeId, textContent] = change
  const node = document.getNodeById(nodeId as NodeId)
  node.setTextContent(stringTable.decode(textContent))
}
