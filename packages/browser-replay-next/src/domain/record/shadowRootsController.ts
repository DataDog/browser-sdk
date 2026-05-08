import type { RecordingScope } from './recordingScope'

export type AddShadowRootCallBack = (shadowRoot: ShadowRoot, scope: RecordingScope) => void
export type RemoveShadowRootCallBack = (shadowRoot: ShadowRoot) => void

export interface ShadowRootsController {
  addShadowRoot: AddShadowRootCallBack
  removeShadowRoot: RemoveShadowRootCallBack
  stop: () => void
  flush: () => void
}
