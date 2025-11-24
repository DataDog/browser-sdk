import { createIpcRenderer } from '../domain/renderer/ipcRenderer'
import { setupRendererBridge } from '../domain/renderer/bridge'

setupRendererBridge()
export const ipcRenderer = createIpcRenderer()
