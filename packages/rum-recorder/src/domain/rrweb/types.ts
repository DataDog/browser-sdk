import { IdNodeMap, INode, MaskInputOptions, SerializedNodeWithId, SlimDOMOptions } from '../rrweb-snapshot/types'
import type { RawRecord } from '../../types'
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

export type SamplingStrategy = Partial<{
  /**
   * false means not to record mouse/touch move events
   * number is the throttle threshold of recording mouse/touch move
   */
  mousemove: boolean | number
  /**
   * number is the throttle threshold of recording scroll
   */
  scroll: number
  /**
   * 'all' will record all the input events
   * 'last' will only record the last input value while input a sequence of chars
   */
  input: 'all' | 'last'
}>

export interface RecordOptions {
  emit?: (record: RawRecord, isCheckout?: boolean) => void
  checkoutEveryNth?: number
  checkoutEveryNms?: number
  maskAllInputs?: boolean
  maskInputOptions?: MaskInputOptions
  maskInputFn?: MaskInputFn
  slimDOMOptions?: SlimDOMOptions | 'all' | true
  inlineStylesheet?: boolean
  packFn?: (record: RawRecord) => RawRecord
  sampling?: SamplingStrategy
  // departed, please use sampling options
  mousemoveWait?: number
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
  maskInputOptions: MaskInputOptions
  maskInputFn?: MaskInputFn
  inlineStylesheet: boolean
  styleSheetRuleCb: StyleSheetRuleCallback
  sampling: SamplingStrategy
  slimDOMOptions: SlimDOMOptions
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

export enum MouseInteractions {
  MouseUp = 0,
  MouseDown = 1,
  Click = 2,
  ContextMenu = 3,
  DblClick = 4,
  Focus = 5,
  Blur = 6,
  TouchStart = 7,
  TouchEnd = 9,
}

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

export const enum MediaInteractions {
  Play,
  Pause,
}

export interface MediaInteractionParam {
  type: MediaInteractions
  id: number
}

export type MediaInteractionCallback = (p: MediaInteractionParam) => void

export interface Mirror {
  map: IdNodeMap
  getId: (n: INode) => number
  getNode: (id: number) => INode | null
  removeNodeFromMap: (n: INode) => void
  has: (id: number) => boolean
}

export type ListenerHandler = () => void
export type HookResetter = () => void
export type Arguments<T> = T extends (...payload: infer U) => unknown ? U : unknown

export type MaskInputFn = (text: string) => string
