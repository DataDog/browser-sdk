import type { EventId, ItemIds, NodeId, StringId, StyleSheetId } from './itemIds'
import {
  createEventIds,
  createNodeIds,
  createStringIds,
  createStyleSheetIds,
  EventIdConstants,
  NodeIdConstants,
  StringIdConstants,
  StyleSheetIdConstants,
} from './itemIds'

describe('ItemIds', () => {
  const describeItemIdVariant = <ItemType, ItemId extends number>(
    name: string,
    createIdMap: () => ItemIds<ItemType, ItemId>,
    createItem: () => ItemType,
    firstId: ItemId
  ) => {
    describe(name, () => {
      let itemIds = createIdMap()

      beforeEach(() => {
        itemIds = createIdMap()
      })

      describe('clear', () => {
        it('removes all id mappings', () => {
          const item = createItem()
          itemIds.getOrInsert(item)
          expect(itemIds.get(item)).toBe(firstId)

          itemIds.clear()
          expect(itemIds.get(item)).toBeUndefined()
        })

        it('restarts the id sequence', () => {
          for (let id = firstId; id < firstId + 3; id++) {
            const item = createItem()
            expect(itemIds.getOrInsert(item)).toBe(id)
            expect(itemIds.getOrInsert(item)).toBe(id)
          }

          itemIds.clear()

          for (let id = firstId; id < firstId + 3; id++) {
            const item = createItem()
            expect(itemIds.getOrInsert(item)).toBe(id)
            expect(itemIds.getOrInsert(item)).toBe(id)
          }
        })
      })

      describe('delete', () => {
        it('allows an item to be re-inserted and receive a new id', () => {
          const item = createItem()
          expect(itemIds.getOrInsert(item)).toBe(firstId)
          expect(itemIds.getOrInsert(item)).toBe(firstId)

          itemIds.delete(item)

          expect(itemIds.getOrInsert(item)).toBe((firstId + 1) as ItemId)
          expect(itemIds.getOrInsert(item)).toBe((firstId + 1) as ItemId)
        })

        it('does not change the next assigned id', () => {
          const item = createItem()
          expect(itemIds.getOrInsert(item)).toBe(firstId)
          expect(itemIds.getOrInsert(item)).toBe(firstId)
          expect(itemIds.nextId).toBe((firstId + 1) as ItemId)

          itemIds.delete(item)
          expect(itemIds.nextId).toBe((firstId + 1) as ItemId)

          const newItem = createItem()
          expect(itemIds.getOrInsert(newItem)).toBe((firstId + 1) as ItemId)
          expect(itemIds.getOrInsert(newItem)).toBe((firstId + 1) as ItemId)
        })
      })

      describe('get', () => {
        it('returns undefined for items that have not been assigned an id', () => {
          expect(itemIds.get(createItem())).toBe(undefined)
        })

        it('returns the assigned id if one exists', () => {
          const item = createItem()
          itemIds.getOrInsert(item)
          expect(itemIds.get(item)).toBe(firstId)
        })
      })

      describe('getOrInsert', () => {
        it('assigns ids in order', () => {
          for (let id = firstId; id < firstId + 3; id++) {
            const item = createItem()
            expect(itemIds.getOrInsert(item)).toBe(id)
            expect(itemIds.getOrInsert(item)).toBe(id)
          }
        })

        it('reuses any existing id', () => {
          itemIds.getOrInsert(createItem())
          itemIds.getOrInsert(createItem())
          const item = createItem()
          const itemId = itemIds.getOrInsert(item)
          expect(itemIds.getOrInsert(item)).toBe(itemId)
          expect(itemIds.get(item)).toBe(itemId)
        })
      })

      describe('nextId getter', () => {
        it('initially returns the first id', () => {
          expect(itemIds.nextId).toBe(firstId)
        })

        it('increments after each insertion', () => {
          for (let id = firstId; id < firstId + 3; id++) {
            const item = createItem()
            expect(itemIds.getOrInsert(item)).toBe(id)
            expect(itemIds.getOrInsert(item)).toBe(id)
            expect(itemIds.nextId).toBe((id + 1) as ItemId)
          }
        })
      })

      describe('size', () => {
        it('increments when an id is assigned', () => {
          expect(itemIds.size).toBe(0)
          itemIds.getOrInsert(createItem())
          expect(itemIds.size).toBe(1)
          itemIds.getOrInsert(createItem())
          expect(itemIds.size).toBe(2)
        })
      })
    })
  }

  describeItemIdVariant(
    'EventIds',
    createEventIds,
    () => new Event('someCustomEvent'),
    EventIdConstants.FIRST_ID as EventId
  )

  describeItemIdVariant(
    'NodeIds',
    createNodeIds,
    () => document.createElement('div'),
    NodeIdConstants.FIRST_ID as NodeId
  )

  let nextString = 0
  describeItemIdVariant(
    'StringIds',
    createStringIds,
    () => `string${nextString++}`,
    StringIdConstants.FIRST_ID as StringId
  )

  describeItemIdVariant(
    'StyleSheetIds',
    createStyleSheetIds,
    // The CSSStyleSheet constructor is not available on older browsers.
    () => ({ type: 'CSSStyleSheet' }),
    StyleSheetIdConstants.FIRST_ID as StyleSheetId
  )
})
