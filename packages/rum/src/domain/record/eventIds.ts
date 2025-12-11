export interface EventIds {
  getIdForEvent(event: Event): number
}

export function createEventIds(): EventIds {
  const eventIds = new WeakMap<Event, number>()
  let nextId = 1

  return {
    getIdForEvent(event: Event): number {
      if (!eventIds.has(event)) {
        eventIds.set(event, nextId++)
      }
      return eventIds.get(event)!
    },
  }
}
