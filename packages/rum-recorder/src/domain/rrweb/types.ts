import { idNodeMap, INode, MaskInputOptions, serializedNodeWithId, SlimDOMOptions } from 'rrweb-snapshot'
import type { RawRecord } from '../../types'

export enum IncrementalSource {
  Mutation,
  MouseMove,
  MouseInteraction,
  Scroll,
  ViewportResize,
  Input,
  TouchMove,
  MediaInteraction,
  StyleSheetRule,
  CanvasMutation,
  Font,
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

export type CanvasMutationData = {
  source: IncrementalSource.CanvasMutation
} & CanvasMutationParam

export type FontData = {
  source: IncrementalSource.Font
} & FontParam

export type IncrementalData =
  | MutationData
  | MousemoveData
  | MouseInteractionData
  | ScrollData
  | ViewportResizeData
  | InputData
  | MediaInteractionData
  | StyleSheetRuleData
  | CanvasMutationData
  | FontData

export type BlockClass = string | RegExp

export type SamplingStrategy = Partial<{
  /**
   * false means not to record mouse/touch move events
   * number is the throttle threshold of recording mouse/touch move
   */
  mousemove: boolean | number
  /**
   * false means not to record mouse interaction events
   * can also specify record some kinds of mouse interactions
   */
  mouseInteraction: boolean | { [key: string]: boolean | undefined }
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

export interface RecordOptions<T> {
  emit?: (e: T, isCheckout?: boolean) => void
  checkoutEveryNth?: number
  checkoutEveryNms?: number
  blockClass?: BlockClass
  blockSelector?: string
  ignoreClass?: string
  maskAllInputs?: boolean
  maskInputOptions?: MaskInputOptions
  maskInputFn?: MaskInputFn
  slimDOMOptions?: SlimDOMOptions | 'all' | true
  inlineStylesheet?: boolean
  hooks?: HooksParam
  packFn?: (record: RawRecord) => RawRecord
  sampling?: SamplingStrategy
  recordCanvas?: boolean
  collectFonts?: boolean
  // departed, please use sampling options
  mousemoveWait?: number
}

export interface RecordAPI {
  stop: ListenerHandler
  takeFullSnapshot: () => void
}

export interface ObserverParam {
  mutationCb: MutationCallBack
  mousemoveCb: MousemoveCallBack
  mouseInteractionCb: MouseInteractionCallBack
  scrollCb: ScrollCallback
  viewportResizeCb: ViewportResizeCallback
  inputCb: InputCallback
  mediaInteractionCb: MediaInteractionCallback
  blockClass: BlockClass
  blockSelector: string | null
  ignoreClass: string
  maskInputOptions: MaskInputOptions
  maskInputFn?: MaskInputFn
  inlineStylesheet: boolean
  styleSheetRuleCb: StyleSheetRuleCallback
  canvasMutationCb: CanvasMutationCallback
  fontCb: FontCallback
  sampling: SamplingStrategy
  recordCanvas: boolean
  collectFonts: boolean
  slimDOMOptions: SlimDOMOptions
}

export interface HooksParam {
  mutation?: MutationCallBack
  mousemove?: MousemoveCallBack
  mouseInteraction?: MouseInteractionCallBack
  scroll?: ScrollCallback
  viewportResize?: ViewportResizeCallback
  input?: InputCallback
  mediaInteaction?: MediaInteractionCallback
  styleSheetRule?: StyleSheetRuleCallback
  canvasMutation?: CanvasMutationCallback
  font?: FontCallback
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
  node: serializedNodeWithId
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
  MouseUp,
  MouseDown,
  Click,
  ContextMenu,
  DblClick,
  Focus,
  Blur,
  TouchStart,
  TouchMove_Departed, // we will start a separate observer for touch move event
  TouchEnd,
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

export type CanvasMutationCallback = (p: CanvasMutationParam) => void

export interface CanvasMutationParam {
  id: number
  property: string
  args: unknown[]
  setter?: true
}

export interface FontFaceDescriptors {
  style?: string
  weight?: string
  stretch?: string
  unicodeRange?: string
  variant?: string
  featureSettings?: string
}

export interface FontParam {
  family: string
  fontSource: string
  buffer: boolean
  descriptors?: FontFaceDescriptors
}

export type FontCallback = (p: FontParam) => void

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
  map: idNodeMap
  getId: (n: INode) => number
  getNode: (id: number) => INode | null
  removeNodeFromMap: (n: INode) => void
  has: (id: number) => boolean
}

export interface ThrottleOptions {
  leading?: boolean
  trailing?: boolean
}

export type ListenerHandler = () => void
export type HookResetter = () => void
export type Arguments<T> = T extends (...payload: infer U) => unknown ? U : unknown

export type MaskInputFn = (text: string) => string
