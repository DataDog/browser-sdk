export type RecordIds = ReturnType<typeof initRecordIds>

export function initRecordIds() {
  const recordIds = new WeakMap<Event, number>()
  let nextId = 1

  return {
    getIdForEvent(event: Event): number {
      if (!recordIds.has(event)) {
        recordIds.set(event, nextId++)
      }
      return recordIds.get(event)!
    },
  }
}
