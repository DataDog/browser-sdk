import type * as SessionReplay from './sessionReplay'

export const RecordType: {
  FullSnapshot: SessionReplay.BrowserFullSnapshotRecord['type']
  IncrementalSnapshot: SessionReplay.BrowserIncrementalSnapshotRecord['type']
  Meta: SessionReplay.MetaRecord['type']
  Focus: SessionReplay.FocusRecord['type']
  ViewEnd: SessionReplay.ViewEndRecord['type']
  VisualViewport: SessionReplay.VisualViewportRecord['type']
  FrustrationRecord: SessionReplay.FrustrationRecord['type']
  Change: SessionReplay.BrowserChangeRecord['type']
} = {
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Focus: 6,
  ViewEnd: 7,
  VisualViewport: 8,
  FrustrationRecord: 9,
  Change: 12,
} as const

export type RecordType = (typeof RecordType)[keyof typeof RecordType]

export const NodeType: {
  Document: SessionReplay.DocumentNode['type']
  DocumentType: SessionReplay.DocumentTypeNode['type']
  Element: SessionReplay.ElementNode['type']
  Text: SessionReplay.TextNode['type']
  CDATA: SessionReplay.CDataNode['type']
  DocumentFragment: SessionReplay.DocumentFragmentNode['type']
} = {
  Document: 0,
  DocumentType: 1,
  Element: 2,
  Text: 3,
  CDATA: 4,
  DocumentFragment: 11,
} as const

export type NodeType = (typeof NodeType)[keyof typeof NodeType]

// ChangeTypeId evaluates to Id if [Id, ...Data[]] is a valid variant of Change;
// otherwise, it triggers a compile-time error.
type ChangeTypeId<Id, Data> = [Id, ...Data[]] extends SessionReplay.Change ? Id : never

export const ChangeType: {
  AddString: ChangeTypeId<0, SessionReplay.AddStringChange>
  AddNode: ChangeTypeId<1, SessionReplay.AddNodeChange>
  RemoveNode: ChangeTypeId<2, SessionReplay.RemoveNodeChange>
  Attribute: ChangeTypeId<3, SessionReplay.AttributeChange>
  Text: ChangeTypeId<4, SessionReplay.TextChange>
  Size: ChangeTypeId<5, SessionReplay.SizeChange>
  ScrollPosition: ChangeTypeId<6, SessionReplay.ScrollPositionChange>
  AddStyleSheet: ChangeTypeId<7, SessionReplay.AddStyleSheetChange>
  AttachedStyleSheets: ChangeTypeId<8, SessionReplay.AttachedStyleSheetsChange>
  MediaPlaybackState: ChangeTypeId<9, SessionReplay.MediaPlaybackStateChange>
  VisualViewport: ChangeTypeId<10, SessionReplay.VisualViewportChange>
} = {
  AddString: 0,
  AddNode: 1,
  RemoveNode: 2,
  Attribute: 3,
  Text: 4,
  Size: 5,
  ScrollPosition: 6,
  AddStyleSheet: 7,
  AttachedStyleSheets: 8,
  MediaPlaybackState: 9,
  VisualViewport: 10,
} as const

export type ChangeType = (typeof ChangeType)[keyof typeof ChangeType]

export const PlaybackState: {
  Playing: SessionReplay.PlaybackStatePlaying
  Paused: SessionReplay.PlaybackStatePaused
} = {
  Playing: 0,
  Paused: 1,
} as const

export type PlaybackState = (typeof PlaybackState)[keyof typeof PlaybackState]

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

export type IncrementalSource = (typeof IncrementalSource)[keyof typeof IncrementalSource]

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

export type MouseInteractionType = (typeof MouseInteractionType)[keyof typeof MouseInteractionType]

export const MediaInteractionType = {
  Play: 0,
  Pause: 1,
} as const

export type MediaInteractionType = (typeof MediaInteractionType)[keyof typeof MediaInteractionType]
