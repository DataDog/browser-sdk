export const NodeType = {
  Document: 0,
  DocumentType: 1,
  Element: 2,
  Text: 3,
  CDATA: 4,
  Comment: 5,
} as const

export type NodeType = typeof NodeType[keyof typeof NodeType]

export type DocumentNode = {
  type: typeof NodeType.Document
  childNodes: SerializedNodeWithId[]
}

export type DocumentTypeNode = {
  type: typeof NodeType.DocumentType
  name: string
  publicId: string
  systemId: string
}

export type Attributes = {
  [key: string]: string | number | boolean
}

export type ElementNode = {
  type: typeof NodeType.Element
  tagName: string
  attributes: Attributes
  childNodes: SerializedNodeWithId[]
  isSVG?: true
}

export type TextNode = {
  type: typeof NodeType.Text
  textContent: string
  isStyle?: true
}

export type CDataNode = {
  type: typeof NodeType.CDATA
  textContent: ''
}

export type SerializedNode = DocumentNode | DocumentTypeNode | ElementNode | TextNode | CDataNode

export type SerializedNodeWithId = SerializedNode & { id: number }
