export const enum NodeType {
  Document,
  DocumentType,
  Element,
  Text,
  CDATA,
  Comment,
}

export type DocumentNode = {
  type: NodeType.Document
  childNodes: SerializedNodeWithId[]
}

export type DocumentTypeNode = {
  type: NodeType.DocumentType
  name: string
  publicId: string
  systemId: string
}

export type Attributes = {
  [key: string]: string | number | boolean
}

export type ElementNode = {
  type: NodeType.Element
  tagName: string
  attributes: Attributes
  childNodes: SerializedNodeWithId[]
  isSVG?: true
}

export type TextNode = {
  type: NodeType.Text
  textContent: string
  isStyle?: true
}

export type CDataNode = {
  type: NodeType.CDATA
  textContent: ''
}

export type SerializedNode = DocumentNode | DocumentTypeNode | ElementNode | TextNode | CDataNode

export type SerializedNodeWithId = SerializedNode & { id: number }
