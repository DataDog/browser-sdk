import { IdNodeMap, INode, SerializedNodeWithId } from '../rrweb-snapshot/types'
import { FocusRecord, RawRecord } from '../../types'
import { MutationController } from './mutation'

export enum IncrementalSource {
  Mutation = 0,
  MouseMove = 1,
  MouseInteraction = 2,
  Scroll = 3,
  ViewportResize = 4,
  Input = 5,
  TouchMove = 6,
  MediaInteraction = 7,
  StyleSheetRule = 8,
  // CanvasMutation = 9,
  // Font = 10,
}

export type MutationData = {
  source: IncrementalSource.Mutation
} & MutationCallbackParam

export interface MousemoveData {
  source: IncrementalSource.MouseMove | IncrementalSource.TouchMove
  positions: MousePosition[]
}

export type MouseInteractionData = {
  source: IncrementalSource.MouseInteraction
} & MouseInteractionParam

export type ScrollData = {
  source: IncrementalSource.Scroll
} & ScrollPosition

export type ViewportResizeData = {
  source: IncrementalSource.ViewportResize
} & ViewportResizeDimention

export type InputData = {
  source: IncrementalSource.Input
  id: number
} & InputValue

export type MediaInteractionData = {
  source: IncrementalSource.MediaInteraction
} & MediaInteractionParam

export type StyleSheetRuleData = {
  source: IncrementalSource.StyleSheetRule
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
  emit?: (record: RawRecord, isCheckout?: boolean) => void
}

export interface RecordAPI {
  stop: ListenerHandler
  takeFullSnapshot: () => void
}

export interface ObserverParam {
  mutationController: MutationController
  mutationCb: MutationCallBack
  mousemoveCb: MousemoveCallBack
  mouseInteractionCb: MouseInteractionCallBack
  scrollCb: ScrollCallback
  viewportResizeCb: ViewportResizeCallback
  inputCb: InputCallback
  mediaInteractionCb: MediaInteractionCallback
  styleSheetRuleCb: StyleSheetRuleCallback
  focusCb: FocusCallback
}

// https://dom.spec.whatwg.org/#interface-mutationrecord
export interface MutationRecord {
  type: string
  target: Node
  oldValue: string | null
  addedNodes: NodeList
  removedNodes: NodeList
  attributeName: string | null
}

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

interface MutationCallbackParam {
  texts: TextMutation[]
  attributes: AttributeMutation[]
  removes: RemovedNodeMutation[]
  adds: AddedNodeMutation[]
}

export type MutationCallBack = (m: MutationCallbackParam) => void

export type MousemoveCallBack = (
  p: MousePosition[],
  source: IncrementalSource.MouseMove | IncrementalSource.TouchMove
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

interface MouseInteractionParam {
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

export interface InputValue {
  text: string
  isChecked: boolean
}

export type InputCallback = (v: InputValue & { id: number }) => void

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

export interface Mirror {
  map: IdNodeMap
  removeNodeFromMap: (n: INode) => void
  has: (id: number) => boolean
}

export type ListenerHandler = () => void
export type HookResetter = () => void
