import type { LogsGlobal } from '@flashcatcloud/browser-logs'
import type { RumGlobal } from '@flashcatcloud/browser-rum'

declare global {
  interface Window {
    FC_LOGS?: LogsGlobal
    FC_RUM?: RumGlobal
  }
}
