export enum NodeType {
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
  needBlock?: boolean
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

export type CommentNode = {
  type: NodeType.Comment
  textContent: string
}

export type SerializedNode = DocumentNode | DocumentTypeNode | ElementNode | TextNode | CDataNode | CommentNode

export type SerializedNodeWithId = SerializedNode & { id: number }

export type tagMap = {
  [key: string]: string
}

export interface INode extends Node {
  __sn: SerializedNodeWithId
}

export type IdNodeMap = {
  [key: number]: INode
}

export type MaskInputOptions = Partial<{
  color: boolean
  date: boolean
  'datetime-local': boolean
  email: boolean
  month: boolean
  // eslint-disable-next-line id-blacklist
  number: boolean
  range: boolean
  search: boolean
  tel: boolean
  text: boolean
  time: boolean
  url: boolean
  week: boolean
  // unify textarea and select element with text input
  textarea: boolean
  select: boolean
}>

export type SlimDOMOptions = Partial<{
  script: boolean
  comment: boolean
  headFavicon: boolean
  headWhitespace: boolean
  headMetaDescKeywords: boolean
  headMetaSocial: boolean
  headMetaRobots: boolean
  headMetaHttpEquiv: boolean
  headMetaAuthorship: boolean
  headMetaVerification: boolean
}>
