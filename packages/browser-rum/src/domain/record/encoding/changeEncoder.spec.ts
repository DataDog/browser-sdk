import { ChangeType, StringRole } from '../../../types'
import { createString } from './roles'
import type { StringId, StringIds } from './stringIds'
import { createStringIds, StringIdConstants } from './stringIds'
import type { ChangeEncoder } from './changeEncoder'
import { createChangeEncoder } from './changeEncoder'

describe('ChangeEncoder', () => {
  let encoder: ChangeEncoder
  let stringIds: StringIds

  beforeEach(() => {
    stringIds = createStringIds()
    encoder = createChangeEncoder(stringIds)
  })

  it('handles a realistic DOM mutation sequence', () => {
    encoder.add(ChangeType.AddNode, [null, 'div', ['class', 'container'], ['id', 'main']])
    encoder.add(ChangeType.AddNode, [0, '#text', 'Hello World'])
    encoder.add(ChangeType.Size, [0, 800, 600])

    const changes = encoder.flush()
    expect(changes).toEqual([
      [
        ChangeType.AddRoleAnnotatedStrings,
        [StringRole.Default, 'div', 'class', 'container', 'id', 'main', '#text', 'Hello World'],
      ],
      [ChangeType.AddNode, [null, 0, [1, 2], [3, 4]], [0, 5, 6]],
      [ChangeType.Size, [0, 800, 600]],
    ])
  })

  describe('add', () => {
    it('adds a single change to the encoder', () => {
      encoder.add(ChangeType.Size, [0, 100, 200])
      const changes = encoder.flush()

      expect(changes).toEqual([[ChangeType.Size, [0, 100, 200]]])
    })

    it('converts strings in change data to string table references', () => {
      encoder.add(ChangeType.Text, [0, 'Hello World'])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'Hello World']],
        [ChangeType.Text, [0, 0 as StringId]],
      ])
    })

    it('reuses existing string table references for duplicate strings', () => {
      encoder.add(ChangeType.Text, [0, 'foo'])
      encoder.add(ChangeType.Text, [1, 'bar'])
      encoder.add(ChangeType.Text, [2, 'foo']) // Duplicate of first string
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'foo', 'bar']],
        [ChangeType.Text, [0, 0 as StringId], [1, 1 as StringId], [2, 0 as StringId]],
      ])
    })

    it('converts strings to string table references at multiple nesting levels', () => {
      encoder.add(ChangeType.AddNode, [null, 'div', ['class', 'container'], ['span', 'text']])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'div', 'class', 'container', 'span', 'text']],
        [ChangeType.AddNode, [null, 0 as StringId, [1 as StringId, 2 as StringId], [3 as StringId, 4 as StringId]]],
      ])
    })

    it('preserves non-string primitive values', () => {
      encoder.add(ChangeType.Size, [5, 100, 200])
      encoder.add(ChangeType.ScrollPosition, [10, 50, 75])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.Size, [5, 100, 200]],
        [ChangeType.ScrollPosition, [10, 50, 75]],
      ])
    })

    it('groups multiple changes of the same type', () => {
      encoder.add(ChangeType.Size, [0, 100, 200])
      encoder.add(ChangeType.Size, [1, 300, 400])
      encoder.add(ChangeType.Size, [2, 500, 600])
      const changes = encoder.flush()

      expect(changes).toEqual([[ChangeType.Size, [0, 100, 200], [1, 300, 400], [2, 500, 600]]])
    })

    it('handles mixed change types', () => {
      encoder.add(ChangeType.Size, [0, 100, 200])
      encoder.add(ChangeType.ScrollPosition, [1, 10, 20])
      encoder.add(ChangeType.Size, [2, 300, 400])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.Size, [0, 100, 200], [2, 300, 400]],
        [ChangeType.ScrollPosition, [1, 10, 20]],
      ])
    })

    it('handles empty strings', () => {
      encoder.add(ChangeType.Text, [0, ''])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, '']],
        [ChangeType.Text, [0, 0 as StringId]],
      ])
    })

    it('uses existing string ids from the string table', () => {
      // Put 'pre-existing' in the string table.
      encoder.add(ChangeType.Text, [0, 'pre-existing'])
      encoder.flush()

      encoder.add(ChangeType.Text, [0, 'pre-existing'])
      encoder.add(ChangeType.Text, [1, 'new-string'])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'new-string']], // Only the new string is added.
        [ChangeType.Text, [0, 0 as StringId], [1, 1 as StringId]],
      ])
    })

    it('maintains string table across multiple flushes', () => {
      encoder.add(ChangeType.Text, [0, 'persistent'])
      encoder.flush()

      encoder.add(ChangeType.Text, [1, 'persistent'])
      const changes = encoder.flush()

      // The second flush should not define 'persistent' again.
      expect(changes).toEqual([[ChangeType.Text, [1, 0 as StringId]]])
    })
  })

  describe('string roles', () => {
    it('defines a role-annotated string in the role it was tagged with', () => {
      encoder.add(ChangeType.Text, [0, createString(StringRole.TextContent, 'Hello World')])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'Hello World']],
        [ChangeType.Text, [0, 0 as StringId]],
      ])
    })

    it('groups the strings it defines by role', () => {
      encoder.add(ChangeType.AddNode, [
        null,
        createString(StringRole.NodeName, 'div'),
        [createString(StringRole.AttributeName, 'class'), createString(StringRole.AttributeValue, 'main')],
        [createString(StringRole.AttributeName, 'id'), createString(StringRole.AttributeValue, 'content')],
      ])
      const changes = encoder.flush()

      // Two attribute names and two attribute values are referenced, against a single node name,
      // so the node name role is defined last.
      expect(changes).toEqual([
        [
          ChangeType.AddRoleAnnotatedStrings,
          [StringRole.AttributeName, 'class', 'id'],
          [StringRole.AttributeValue, 'main', 'content'],
          [StringRole.NodeName, 'div'],
        ],
        [ChangeType.AddNode, [null, 4 as StringId, [0 as StringId, 2 as StringId], [1 as StringId, 3 as StringId]]],
      ])
    })

    it('defines the same string in two roles separately, with distinct ids', () => {
      encoder.add(ChangeType.Text, [0, createString(StringRole.TextContent, 'shared')])
      encoder.add(ChangeType.Attribute, [1, [createString(StringRole.AttributeName, 'shared')]])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'shared'], [StringRole.AttributeName, 'shared']],
        [ChangeType.Attribute, [1, [1 as StringId]]],
        [ChangeType.Text, [0, 0 as StringId]],
      ])
    })

    it('keeps the order the roles were encountered in when their strings tie', () => {
      encoder.add(ChangeType.Text, [0, createString(StringRole.TextContent, 'text')])
      encoder.add(ChangeType.Attribute, [1, [createString(StringRole.AttributeName, 'class')]])
      const changes = encoder.flush()

      // Both strings are referenced once, so neither role has a claim on the lower ids.
      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'text'], [StringRole.AttributeName, 'class']],
        [ChangeType.Attribute, [1, [1 as StringId]]],
        [ChangeType.Text, [0, 0 as StringId]],
      ])
    })
  })

  describe('optimizing the encoding', () => {
    it('defines the role its changes refer to the most first', () => {
      encoder.add(ChangeType.Text, [0, createString(StringRole.TextContent, 'text')])
      encoder.add(ChangeType.Attribute, [1, [createString(StringRole.AttributeName, 'class')]])
      encoder.add(ChangeType.Attribute, [2, [createString(StringRole.AttributeName, 'class')]])
      const changes = encoder.flush()

      // The attribute name role is referenced twice and the text content role once, so it is
      // defined first and takes the lower id, even though it wasn't the role seen first.
      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.AttributeName, 'class'], [StringRole.TextContent, 'text']],
        [ChangeType.Attribute, [1, [0 as StringId]], [2, [0 as StringId]]],
        [ChangeType.Text, [0, 1 as StringId]],
      ])
    })

    it('keeps the strings of a role in the order they were encountered', () => {
      encoder.add(ChangeType.Text, [0, createString(StringRole.TextContent, 'once')])
      encoder.add(ChangeType.Text, [1, createString(StringRole.TextContent, 'thrice')])
      encoder.add(ChangeType.Text, [2, createString(StringRole.TextContent, 'thrice')])
      encoder.add(ChangeType.Text, [3, createString(StringRole.TextContent, 'thrice')])
      const changes = encoder.flush()

      // Only roles are ordered by how often they are referenced, so 'thrice' does not overtake
      // 'once' within the run.
      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'once', 'thrice']],
        [ChangeType.Text, [0, 0 as StringId], [1, 1 as StringId], [2, 1 as StringId], [3, 1 as StringId]],
      ])
    })
  })

  describe('soft max size of the string table', () => {
    /**
     * Replaces the string table with one that claims to already hold all but
     * `remainingEntries` of the entries its soft max size allows; inserting enough
     * strings to actually reach the limit would be far too expensive for a test. The
     * phantom entries don't affect the ids that real strings get, which still start at
     * the first id, and clearing the table discards them along with the real entries.
     */
    const fillStringTableToWithin = (remainingEntries: number) => {
      const realStringIds = createStringIds()
      let phantomStringCount = Number(StringIdConstants.SOFT_MAX_SIZE) - remainingEntries
      stringIds = {
        clear: () => {
          phantomStringCount = 0
          realStringIds.clear()
        },
        get: realStringIds.get,
        getOrInsert: realStringIds.getOrInsert,
        get size() {
          return phantomStringCount + realStringIds.size
        },
      }
      encoder = createChangeEncoder(stringIds)
    }

    it('clears the string table once the soft max size is reached', () => {
      fillStringTableToWithin(1)

      encoder.add(ChangeType.Text, [0, 'new-string'])
      const changes = encoder.flush()

      // The new string is defined in the string table like any other. The table is cleared
      // afterwards, once the changes that refer to its entries have been played back.
      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'new-string']],
        [ChangeType.Text, [0, 0 as StringId]],
        [ChangeType.ClearStrings],
      ])
    })

    it('keeps the string table until the soft max size is reached', () => {
      fillStringTableToWithin(2)

      encoder.add(ChangeType.Text, [0, 'new-string'])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'new-string']],
        [ChangeType.Text, [0, 0 as StringId]],
      ])
    })

    it('counts the strings the buffered changes will define toward the soft max size', () => {
      fillStringTableToWithin(2)

      // Neither change fills the string table on its own, but together they reach the limit.
      encoder.add(ChangeType.Text, [0, 'first'])
      encoder.add(ChangeType.Text, [1, 'second'])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'first', 'second']],
        [ChangeType.Text, [0, 0 as StringId], [1, 1 as StringId]],
        [ChangeType.ClearStrings],
      ])
    })

    it('counts a string the changes refer to repeatedly only once', () => {
      fillStringTableToWithin(2)

      // Both changes refer to the same string, so only one entry is needed for them.
      encoder.add(ChangeType.Text, [0, 'repeated'])
      encoder.add(ChangeType.Text, [1, 'repeated'])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'repeated']],
        [ChangeType.Text, [0, 0 as StringId], [1, 0 as StringId]],
      ])
    })

    it('starts a new run of changes where it clears the string table', () => {
      fillStringTableToWithin(1)

      // The first change reaches the soft max size, so it ends up in a run of its own, ahead of
      // the clear. The changes after it define their strings in the emptied table, which hands
      // out its ids from the start again, rather than carrying them as literals.
      encoder.add(ChangeType.Text, [0, 'before the clear'])
      encoder.add(ChangeType.AddNode, [null, 'div', ['class', 'container']])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'before the clear']],
        [ChangeType.Text, [0, 0 as StringId]],
        [ChangeType.ClearStrings],
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'div', 'class', 'container']],
        [ChangeType.AddNode, [null, 0 as StringId, [1 as StringId, 2 as StringId]]],
      ])
    })

    it('keeps a change that depends on an earlier one after it across a clear', () => {
      fillStringTableToWithin(1)

      // Adding the node reaches the soft max size, so the attribute change that depends on it
      // lands in the run after the clear. Only the changes within a run are reordered to
      // satisfy their dependencies, so the node has to stay in the earlier run.
      encoder.add(ChangeType.AddNode, [null, 'div'])
      encoder.add(ChangeType.Attribute, [0, ['class', 'container']])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'div']],
        [ChangeType.AddNode, [null, 0 as StringId]],
        [ChangeType.ClearStrings],
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'class', 'container']],
        [ChangeType.Attribute, [0, [0 as StringId, 1 as StringId]]],
      ])
    })

    it('defines strings again once the string table has been cleared', () => {
      fillStringTableToWithin(1)
      encoder.add(ChangeType.Text, [0, 'discarded'])
      encoder.flush()

      encoder.add(ChangeType.Text, [1, 'discarded'])
      const changes = encoder.flush()

      // The cleared table no longer holds the string, so it is defined again, and it takes the
      // first id now that the table is empty.
      expect(changes).toEqual([
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.Default, 'discarded']],
        [ChangeType.Text, [1, 0 as StringId]],
      ])
    })
  })

  describe('flush', () => {
    it('returns an empty array when no changes have been added', () => {
      const changes = encoder.flush()
      expect(changes).toEqual([])
    })

    it('clears the buffer after flushing', () => {
      encoder.add(ChangeType.Size, [0, 100, 200])
      encoder.flush()

      const secondFlush = encoder.flush()
      expect(secondFlush).toEqual([])
    })

    it('allows adding new changes after flushing', () => {
      encoder.add(ChangeType.Size, [0, 100, 200])
      encoder.flush()

      encoder.add(ChangeType.ScrollPosition, [1, 10, 20])
      const changes = encoder.flush()

      expect(changes).toEqual([[ChangeType.ScrollPosition, [1, 10, 20]]])
    })

    it('respects dependency order for all change types', () => {
      encoder.add(ChangeType.VisualViewport, [100, 200, 100, 200, 100, 200, 300])
      encoder.add(ChangeType.MediaPlaybackState, [0, 0])
      encoder.add(ChangeType.AttachedStyleSheets, [0, 1, 2])
      encoder.add(ChangeType.AddStyleSheet, [['rule1']])
      encoder.add(ChangeType.ScrollPosition, [0, 10, 20])
      encoder.add(ChangeType.Size, [0, 100, 200])
      encoder.add(ChangeType.InputSelection, [0, 1])
      encoder.add(ChangeType.InputValue, [0, 'value'])
      encoder.add(ChangeType.Text, [0, 'text'])
      encoder.add(ChangeType.Attribute, [0, ['id', 'test']])
      encoder.add(ChangeType.RemoveNode, 1)
      encoder.add(ChangeType.AddNode, [null, 'div'])

      const changes = encoder.flush()

      // Ensure that the flushed changes are ordered in a way that respects potential
      // dependencies between them.
      const changeTypes = changes.map((change) => change[0])
      expect(changeTypes).toEqual([
        ChangeType.AddRoleAnnotatedStrings, // Automatically added for strings.
        ChangeType.AddNode,
        ChangeType.RemoveNode,
        ChangeType.Attribute,
        ChangeType.Text,
        ChangeType.InputValue,
        ChangeType.InputSelection,
        ChangeType.Size,
        ChangeType.ScrollPosition,
        ChangeType.AddStyleSheet,
        ChangeType.AttachedStyleSheets,
        ChangeType.MediaPlaybackState,
        ChangeType.VisualViewport,
      ])
    })
  })
})
