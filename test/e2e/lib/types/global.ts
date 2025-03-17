import type { LogsGlobal } from '@flashcatcloud/browser-logs'
import type { RumGlobal } from '@flashcatcloud/browser-rum'

declare global {
  interface Window {
    DD_LOGS?: LogsGlobal
    DD_RUM?: RumGlobal
  }
}
