export type EventId = number & { __brand: 'EventId' }
export type EventIds = ItemIds<Event, EventId>
export const enum EventIdConstants {
  FIRST_ID = 1,
}
export function createEventIds(): EventIds {
  return createWeakIdMap(EventIdConstants.FIRST_ID as EventId)
}

export type NodeId = number & { __brand: 'NodeId' }
export type NodeIds = ItemIds<Node, NodeId>
export const enum NodeIdConstants {
  FIRST_ID = 0,
}
export function createNodeIds(): NodeIds {
  return createWeakIdMap(NodeIdConstants.FIRST_ID as NodeId)
}

export type StringId = number & { __brand: 'StringId' }
export type StringIds = ItemIds<string, StringId>
export const enum StringIdConstants {
  FIRST_ID = 0,
}
export function createStringIds(): StringIds {
  return createIdMap(StringIdConstants.FIRST_ID as StringId)
}

export type StyleSheetId = number & { __brand: 'StyleSheetId' }
export type StyleSheetIds = ItemIds<CSSStyleSheet, StyleSheetId>
export const enum StyleSheetIdConstants {
  FIRST_ID = 0,
}
export function createStyleSheetIds(): StyleSheetIds {
  return createWeakIdMap(StyleSheetIdConstants.FIRST_ID as StyleSheetId)
}

export interface ItemIds<ItemType, ItemId extends number> {
  clear(this: void): void
  get(this: void, item: ItemType): ItemId | undefined
  getOrInsert(this: void, item: ItemType): ItemId
  get size(): number
}

function createIdMap<ItemType, ItemId extends number>(firstId: ItemId): ItemIds<ItemType, ItemId> {
  return createItemIds(() => new Map<ItemType, ItemId>(), firstId)
}

function createWeakIdMap<ItemType extends object, ItemId extends number>(firstId: ItemId): ItemIds<ItemType, ItemId> {
  return createItemIds(() => new WeakMap<ItemType, ItemId>(), firstId)
}

interface MapLike<Key, Value> {
  get(key: Key): Value | undefined
  set(key: Key, value: Value): void
}

function createItemIds<ItemType, ItemId extends number>(
  createMap: () => MapLike<ItemType, ItemId>,
  firstId: ItemId
): ItemIds<ItemType, ItemId> {
  let map = createMap()
  let nextId = firstId

  const get = (object: ItemType): ItemId | undefined => map.get(object)

  return {
    clear(): void {
      map = createMap()
      nextId = firstId
    },
    get,
    getOrInsert(object: ItemType): ItemId {
      // Try to reuse any existing id.
      let id = get(object)
      if (id === undefined) {
        id = nextId++ as ItemId
        map.set(object, id)
      }
      return id
    },
    get size(): number {
      return nextId - firstId
    },
  }
}
