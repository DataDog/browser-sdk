import type { DefaultPrivacyLevel, TimeStamp } from '@datadog/browser-core'
import type { FocusRecord, VisualViewportRecord, Record } from '../../types'
import type { MutationController } from './mutationObserver'

export const IncrementalSource = {
  Mutation: 0,
  MouseMove: 1,
  MouseInteraction: 2,
  Scroll: 3,
  ViewportResize: 4,
  Input: 5,
  TouchMove: 6,
  MediaInteraction: 7,
  StyleSheetRule: 8,
  // CanvasMutation : 9,
  // Font : 10,
} as const

export type IncrementalSource = typeof IncrementalSource[keyof typeof IncrementalSource]

export type MutationData = {
  source: typeof IncrementalSource.Mutation
} & MutationPayload

export interface MousemoveData {
  source: typeof IncrementalSource.MouseMove | typeof IncrementalSource.TouchMove
  positions: MousePosition[]
}

export type MouseInteractionData = {
  source: typeof IncrementalSource.MouseInteraction
} & MouseInteractionParam

export type ScrollData = {
  source: typeof IncrementalSource.Scroll
} & ScrollPosition

export type ViewportResizeData = {
  source: typeof IncrementalSource.ViewportResize
} & ViewportResizeDimention

export type InputData = {
  source: typeof IncrementalSource.Input
  id: number
} & InputState

export type MediaInteractionData = {
  source: typeof IncrementalSource.MediaInteraction
} & MediaInteractionParam

export type StyleSheetRuleData = {
  source: typeof IncrementalSource.StyleSheetRule
} & StyleSheetRuleParam

export type IncrementalData =
  | MutationData
  | MousemoveData
  | MouseInteractionData
  | ScrollData
  | ViewportResizeData
  | InputData
  | MediaInteractionData
  | StyleSheetRuleData

export interface RecordOptions {
  emit?: (record: Record) => void
  defaultPrivacyLevel: DefaultPrivacyLevel
}

export interface RecordAPI {
  stop: ListenerHandler
  takeFullSnapshot: (timestamp?: TimeStamp) => void
  flushMutations: () => void
}

export interface ObserverParam {
  defaultPrivacyLevel: DefaultPrivacyLevel
  mutationController: MutationController
  mutationCb: MutationCallBack
  mousemoveCb: MousemoveCallBack
  mouseInteractionCb: MouseInteractionCallBack
  scrollCb: ScrollCallback
  viewportResizeCb: ViewportResizeCallback
  visualViewportResizeCb: VisualViewportResizeCallback
  inputCb: InputCallback
  mediaInteractionCb: MediaInteractionCallback
  styleSheetRuleCb: StyleSheetRuleCallback
  focusCb: FocusCallback
}

// https://dom.spec.whatwg.org/#interface-mutationrecord
export interface RumCharacterDataMutationRecord {
  type: 'characterData'
  target: Node
  oldValue: string | null
}

export interface RumAttributesMutationRecord {
  type: 'attributes'
  target: Element
  oldValue: string | null
  attributeName: string | null
}

export interface RumChildListMutationRecord {
  type: 'childList'
  target: Node
  addedNodes: NodeList
  removedNodes: NodeList
}

export type RumMutationRecord =
  | RumCharacterDataMutationRecord
  | RumAttributesMutationRecord
  | RumChildListMutationRecord

export interface TextCursor {
  node: Node
  value: string | null
}
export interface TextMutation {
  id: number
  value: string | null
}

export interface AttributeCursor {
  node: Node
  attributes: {
    [key: string]: string | null
  }
}
export interface AttributeMutation {
  id: number
  attributes: {
    [key: string]: string | null
  }
}

export interface RemovedNodeMutation {
  parentId: number
  id: number
}

export interface AddedNodeMutation {
  parentId: number
  // Newly recorded mutations will not have previousId any more, just for compatibility
  previousId?: number | null
  nextId: number | null
  node: SerializedNodeWithId
}

export interface MutationPayload {
  texts: TextMutation[]
  attributes: AttributeMutation[]
  removes: RemovedNodeMutation[]
  adds: AddedNodeMutation[]
}

export type MutationCallBack = (m: MutationPayload) => void

export type MousemoveCallBack = (
  p: MousePosition[],
  source: typeof IncrementalSource.MouseMove | typeof IncrementalSource.TouchMove
) => void

export interface MousePosition {
  x: number
  y: number
  id: number
  timeOffset: number
}

export const MouseInteractions = {
  MouseUp: 0,
  MouseDown: 1,
  Click: 2,
  ContextMenu: 3,
  DblClick: 4,
  Focus: 5,
  Blur: 6,
  TouchStart: 7,
  TouchEnd: 9,
} as const

export type MouseInteractions = typeof MouseInteractions[keyof typeof MouseInteractions]

export interface MouseInteractionParam {
  type: MouseInteractions
  id: number
  x: number
  y: number
}

export type MouseInteractionCallBack = (d: MouseInteractionParam) => void

export interface ScrollPosition {
  id: number
  x: number
  y: number
}

export type ScrollCallback = (p: ScrollPosition) => void

export interface StyleSheetAddRule {
  rule: string
  index?: number
}

export interface StyleSheetDeleteRule {
  index: number
}

export interface StyleSheetRuleParam {
  id: number
  removes?: StyleSheetDeleteRule[]
  adds?: StyleSheetAddRule[]
}

export type StyleSheetRuleCallback = (s: StyleSheetRuleParam) => void

export interface ViewportResizeDimention {
  width: number
  height: number
}

export type ViewportResizeCallback = (d: ViewportResizeDimention) => void

export type InputState = { text: string } | { isChecked: boolean }

export type InputCallback = (v: InputState & { id: number }) => void

export const MediaInteractions = {
  Play: 0,
  Pause: 1,
} as const

export type MediaInteractions = typeof MediaInteractions[keyof typeof MediaInteractions]

export interface MediaInteractionParam {
  type: MediaInteractions
  id: number
}

export type MediaInteractionCallback = (p: MediaInteractionParam) => void

export type FocusCallback = (data: FocusRecord['data']) => void

export type VisualViewportResizeCallback = (data: VisualViewportRecord['data']) => void

export type ListenerHandler = () => void

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
