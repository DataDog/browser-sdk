import type { EventRegistry } from '../framework'

export function getFirstSegment(events: EventRegistry) {
  return events.sessionReplay[0].segment.data
}

export function getLastSegment(events: EventRegistry) {
  return events.sessionReplay[events.sessionReplay.length - 1].segment.data
}
