import { createIpcRenderer } from '../domain/renderer/ipcRenderer'
export { setupRendererBridge } from '../domain/renderer/bridge'

// eslint-disable-next-line local-rules/disallow-side-effects
export const ipcRenderer = createIpcRenderer()
