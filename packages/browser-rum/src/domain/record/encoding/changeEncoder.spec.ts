import { ChangeType, StringRole } from '../../../types'
import { createString } from './roles'
import type { StringId } from './stringIds'
import { createStringIds, StringIdConstants } from './stringIds'
import type { ChangeEncoder } from './changeEncoder'
import { createChangeEncoder } from './changeEncoder'

describe('ChangeEncoder', () => {
  let encoder: ChangeEncoder
  let stringIds: ReturnType<typeof createStringIds>

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

    it('keeps the role of a string that did not fit in the string table', () => {
      Object.defineProperty(stringIds, 'size', { get: () => StringIdConstants.SOFT_MAX_SIZE, configurable: true })

      const annotatedString = createString(StringRole.TextContent, 'new-string')
      encoder.add(ChangeType.Text, [0, annotatedString])
      const changes = encoder.flush()

      expect(changes).toEqual([[ChangeType.Text, [0, annotatedString]]])
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
    // Simulates a full string table without actually inserting a million entries.
    const simulateFullStringTable = () => {
      Object.defineProperty(stringIds, 'size', { get: () => StringIdConstants.SOFT_MAX_SIZE, configurable: true })
    }

    it('does not add new strings to the table once the soft max size is reached', () => {
      simulateFullStringTable()

      encoder.add(ChangeType.Text, [0, 'new-string'])
      const changes = encoder.flush()

      // The new string remains a literal in the change data and no definition is emitted. It is
      // tagged with the role it would have been defined in, even though that role is the
      // default one, so that the intake can tell what kind of data every literal holds.
      expect(changes).toEqual([[ChangeType.Text, [0, createString(StringRole.Default, 'new-string')]]])
    })

    it('still reuses existing string ids once the soft max size is reached', () => {
      // Put 'existing' in the string table before it fills up.
      encoder.add(ChangeType.Text, [0, 'existing'])
      encoder.flush()
      simulateFullStringTable()

      encoder.add(ChangeType.Text, [0, 'existing'])
      const changes = encoder.flush()

      // No definition is emitted, but the existing string is still replaced with its id.
      expect(changes).toEqual([[ChangeType.Text, [0, 0 as StringId]]])
    })

    it('handles a mix of new and existing strings once the soft max size is reached', () => {
      // Put 'foo' in the string table before it fills up.
      encoder.add(ChangeType.AddNode, [null, 'foo'])
      encoder.flush()
      simulateFullStringTable()

      encoder.add(ChangeType.AddNode, [null, 'foo', ['class', 'bar']])
      const changes = encoder.flush()

      // 'foo' is replaced with its existing id; 'class' and 'bar' stay as role-annotated literals.
      expect(changes).toEqual([
        [
          ChangeType.AddNode,
          [null, 0 as StringId, [createString(StringRole.Default, 'class'), createString(StringRole.Default, 'bar')]],
        ],
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
