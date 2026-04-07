import type { RumActionEvent, RumErrorEvent, RumLongTaskEvent, RumResourceEvent } from 'rum-events-format/rum'

export function isActionChildEvent(id: string) {
  return (event: RumActionEvent | RumErrorEvent | RumLongTaskEvent | RumResourceEvent) =>
    event.action !== undefined && event.action.id !== undefined && event.action.id.includes(id)
}
