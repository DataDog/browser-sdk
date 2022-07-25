/* eslint-disable unicorn/filename-case */
import type * as SessionReplay from './session-replay'

export const RecordType: {
  FullSnapshot: SessionReplay.BrowserFullSnapshotRecord['type']
  IncrementalSnapshot: SessionReplay.BrowserIncrementalSnapshotRecord['type']
  Meta: SessionReplay.MetaRecord['type']
  Focus: SessionReplay.FocusRecord['type']
  ViewEnd: SessionReplay.ViewEndRecord['type']
  VisualViewport: SessionReplay.VisualViewportRecord['type']
  FrustrationRecord: SessionReplay.FrustrationRecord['type']
} = {
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Focus: 6,
  ViewEnd: 7,
  VisualViewport: 8,
  FrustrationRecord: 9,
} as const

export type RecordType = typeof RecordType[keyof typeof RecordType]

export const NodeType: {
  Document: SessionReplay.DocumentNode['type']
  DocumentType: SessionReplay.DocumentTypeNode['type']
  Element: SessionReplay.ElementNode['type']
  Text: SessionReplay.TextNode['type']
  CDATA: SessionReplay.CDataNode['type']
} = {
  Document: 0,
  DocumentType: 1,
  Element: 2,
  Text: 3,
  CDATA: 4,
} as const

export type NodeType = typeof NodeType[keyof typeof NodeType]

export const IncrementalSource: {
  Mutation: SessionReplay.BrowserMutationData['source']
  MouseMove: Exclude<SessionReplay.MousemoveData['source'], 6>
  MouseInteraction: SessionReplay.MouseInteractionData['source']
  Scroll: SessionReplay.ScrollData['source']
  ViewportResize: SessionReplay.ViewportResizeData['source']
  Input: SessionReplay.InputData['source']
  TouchMove: Exclude<SessionReplay.MousemoveData['source'], 1>
  MediaInteraction: SessionReplay.MediaInteractionData['source']
  StyleSheetRule: SessionReplay.StyleSheetRuleData['source']
} = {
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

export const MediaInteractionType = {
  Play: 0,
  Pause: 1,
} as const

export type MediaInteractionType = typeof MediaInteractionType[keyof typeof MediaInteractionType]
