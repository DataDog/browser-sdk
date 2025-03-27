import { init_logs_extensions } from '../../init_rum_extensions'

console.log('[Extension - Popup] Initializing RUM only in extension.');

init_logs_extensions()

console.log('[Extension - Popup] RUM initialized in extension.');