import { beforeEach, describe, expect, it } from 'vitest'
import { ChangeType } from '../../../types'
import type { StringId } from '../itemIds'
import { createStringIds } from '../itemIds'
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
      [ChangeType.AddString, 'div', 'class', 'container', 'id', 'main', '#text', 'Hello World'],
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
        [ChangeType.AddString, 'Hello World'],
        [ChangeType.Text, [0, 0 as StringId]],
      ])
    })

    it('reuses existing string table references for duplicate strings', () => {
      encoder.add(ChangeType.Text, [0, 'foo'])
      encoder.add(ChangeType.Text, [1, 'bar'])
      encoder.add(ChangeType.Text, [2, 'foo']) // Duplicate of first string
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddString, 'foo', 'bar'],
        [ChangeType.Text, [0, 0 as StringId], [1, 1 as StringId], [2, 0 as StringId]],
      ])
    })

    it('converts strings to string table references at multiple nesting levels', () => {
      encoder.add(ChangeType.AddNode, [null, 'div', ['class', 'container'], ['span', 'text']])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddString, 'div', 'class', 'container', 'span', 'text'],
        [ChangeType.AddNode, [null, 0 as StringId, [1 as StringId, 2 as StringId], [3 as StringId, 4 as StringId]]],
      ])
    })

    it('does not convert strings for AddString changes', () => {
      encoder.add(ChangeType.AddString, 'test-string')
      const changes = encoder.flush()

      expect(changes).toEqual([[ChangeType.AddString, 'test-string']])
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
        [ChangeType.AddString, ''],
        [ChangeType.Text, [0, 0 as StringId]],
      ])
    })

    it('uses existing string ids from the string table', () => {
      // Pre-populate the string table.
      const preExistingId = stringIds.getOrInsert('pre-existing')

      encoder.add(ChangeType.Text, [0, 'pre-existing'])
      encoder.add(ChangeType.Text, [1, 'new-string'])
      const changes = encoder.flush()

      expect(changes).toEqual([
        [ChangeType.AddString, 'new-string'], // Only the new string is added.
        [ChangeType.Text, [0, preExistingId], [1, 1 as StringId]],
      ])
    })

    it('maintains string table across multiple flushes', () => {
      encoder.add(ChangeType.Text, [0, 'persistent'])
      encoder.flush()

      encoder.add(ChangeType.Text, [1, 'persistent'])
      const changes = encoder.flush()

      // The second flush should not have an AddString change for 'persistent'.
      expect(changes).toEqual([[ChangeType.Text, [1, 0 as StringId]]])
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
      encoder.add(ChangeType.Text, [0, 'text'])
      encoder.add(ChangeType.Attribute, [0, ['id', 'test']])
      encoder.add(ChangeType.RemoveNode, 1)
      encoder.add(ChangeType.AddNode, [null, 'div'])

      const changes = encoder.flush()

      // Ensure that the flushed changes are ordered in a way that respects potential
      // dependencies between them.
      const changeTypes = changes.map((change) => change[0])
      expect(changeTypes).toEqual([
        ChangeType.AddString, // Automatically added for strings.
        ChangeType.AddNode,
        ChangeType.RemoveNode,
        ChangeType.Attribute,
        ChangeType.Text,
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
