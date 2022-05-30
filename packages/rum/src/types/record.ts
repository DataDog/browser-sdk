import type { TimeStamp } from '@datadog/browser-core'
import type { SerializedNodeWithId } from './serializedNode'

export type Record =
  | FullSnapshotRecord
  | IncrementalSnapshotRecord
  | MetaRecord
  | FocusRecord
  | ViewEndRecord
  | VisualViewportRecord

export const RecordType = {
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Focus: 6,
  ViewEnd: 7,
  VisualViewport: 8,
} as const

export type RecordType = typeof RecordType[keyof typeof RecordType]

export interface FullSnapshotRecord {
  type: typeof RecordType.FullSnapshot
  timestamp: TimeStamp
  data: {
    node: SerializedNodeWithId
    initialOffset: {
      top: number
      left: number
    }
  }
}

export interface IncrementalSnapshotRecord {
  type: typeof RecordType.IncrementalSnapshot
  timestamp: TimeStamp
  data: IncrementalData
}

export interface MetaRecord {
  type: typeof RecordType.Meta
  timestamp: TimeStamp
  data: {
    href: string
    width: number
    height: number
  }
}

export interface FocusRecord {
  type: typeof RecordType.Focus
  timestamp: TimeStamp
  data: {
    has_focus: boolean
  }
}

export interface ViewEndRecord {
  type: typeof RecordType.ViewEnd
  timestamp: TimeStamp
}

export interface VisualViewportRecord {
  type: typeof RecordType.VisualViewport
  timestamp: TimeStamp
  data: {
    scale: number
    offsetLeft: number
    offsetTop: number
    pageLeft: number
    pageTop: number
    height: number
    width: number
  }
}

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
} & MouseInteraction

export type ScrollData = {
  source: typeof IncrementalSource.Scroll
} & ScrollPosition

export type ViewportResizeData = {
  source: typeof IncrementalSource.ViewportResize
} & ViewportResizeDimension

export type InputData = {
  source: typeof IncrementalSource.Input
  id: number
} & InputState

export type MediaInteractionData = {
  source: typeof IncrementalSource.MediaInteraction
} & MediaInteraction

export type StyleSheetRuleData = {
  source: typeof IncrementalSource.StyleSheetRule
} & StyleSheetRule

export type IncrementalData =
  | MutationData
  | MousemoveData
  | MouseInteractionData
  | ScrollData
  | ViewportResizeData
  | InputData
  | MediaInteractionData
  | StyleSheetRuleData

export interface MutationPayload {
  texts: TextMutation[]
  attributes: AttributeMutation[]
  removes: RemovedNodeMutation[]
  adds: AddedNodeMutation[]
}

export interface TextMutation {
  id: number
  value: string | null
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

export interface MousePosition {
  x: number
  y: number
  id: number
  timeOffset: number
}

export interface MouseInteraction {
  type: MouseInteractionType
  id: number
  x: number
  y: number
}

export const MouseInteractionType = {
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

export type MouseInteractionType = typeof MouseInteractionType[keyof typeof MouseInteractionType]

export interface ScrollPosition {
  id: number
  x: number
  y: number
}

export interface ViewportResizeDimension {
  width: number
  height: number
}

export type InputState = { text: string } | { isChecked: boolean }

export const MediaInteractionType = {
  Play: 0,
  Pause: 1,
} as const

export type MediaInteractionType = typeof MediaInteractionType[keyof typeof MediaInteractionType]

export interface MediaInteraction {
  type: MediaInteractionType
  id: number
}

export interface StyleSheetAddRule {
  rule: string
  index?: number | number[]
}

export interface StyleSheetDeleteRule {
  index: number | number[]
}

export interface StyleSheetRule {
  id: number
  removes?: StyleSheetDeleteRule[]
  adds?: StyleSheetAddRule[]
}
