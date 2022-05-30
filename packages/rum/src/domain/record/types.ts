import type { DefaultPrivacyLevel, TimeStamp } from '@datadog/browser-core'
import type {
  FocusRecord,
  VisualViewportRecord,
  Record,
  MousePosition,
  IncrementalSource,
  MouseInteraction,
  ScrollPosition,
  StyleSheetRule,
  ViewportResizeDimension,
  MediaInteraction,
  MutationPayload,
  InputState,
} from '../../types'
import type { MutationController } from './mutationObserver'

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
export interface AttributeCursor {
  node: Node
  attributes: {
    [key: string]: string | null
  }
}
export type MutationCallBack = (m: MutationPayload) => void

export type MousemoveCallBack = (
  p: MousePosition[],
  source: typeof IncrementalSource.MouseMove | typeof IncrementalSource.TouchMove
) => void

export type MouseInteractionCallBack = (d: MouseInteraction) => void

export type ScrollCallback = (p: ScrollPosition) => void

export type StyleSheetRuleCallback = (s: StyleSheetRule) => void

export type ViewportResizeCallback = (d: ViewportResizeDimension) => void

export type InputCallback = (v: InputState & { id: number }) => void

export type MediaInteractionCallback = (p: MediaInteraction) => void

export type FocusCallback = (data: FocusRecord['data']) => void

export type VisualViewportResizeCallback = (data: VisualViewportRecord['data']) => void

export type ListenerHandler = () => void
