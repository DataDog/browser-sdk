import type { Change } from '../../../types'
import { ChangeType } from '../../../types'
import type { StringIds } from '../itemIds'

type ChangeData<T extends ChangeType> =
  Extract<Change, [T, ...unknown[]]> extends [T, ...infer Rest] ? Rest[number] : never

/**
 * ChangeEncoder handles the low-level work of building compact, optimized sequences of
 * Changes. In particular, it:
 * - Converts literal strings to string table references, to eliminate the duplication
 * of transferring the same strings repeatedly.
 * - Groups changes by type, instead of transmitting them strictly in order, so that we
 * can avoid transmitting a separate Change data structure with an independent type tag
 * for each small mutation. (It's safe to do this for changes that occur within the same
 * SerializationTransaction since they logically happen at the same time.)
 */
export interface ChangeEncoder {
  /** Encode a Change of the given type and add it to the internal buffer. */
  add<T extends ChangeType>(type: T, data: ChangeData<T>): void
  /** Flush the internal buffer, returning all Changes added since the last flush(). */
  flush(): Change[]
}

export function createChangeEncoder(stringIds: StringIds): ChangeEncoder {
  let pendingChanges: Partial<Record<ChangeType, unknown[]>> = {}

  // A helper that searches for strings in arbitrarily-nested arrays, inserts any strings
  // it finds into the string table, and replaces the strings with string table
  // references.
  const convertStringsToStringReferences = (array: any[]): void => {
    for (let index = 0, length = array.length; index < length; index++) {
      const item = array[index]
      if (typeof item === 'string') {
        const previousSize = stringIds.size
        array[index] = stringIds.getOrInsert(item)
        if (stringIds.size > previousSize) {
          add(ChangeType.AddString, item)
        }
      } else if (Array.isArray(item)) {
        convertStringsToStringReferences(item)
      }
    }
  }

  const add = <T extends ChangeType>(type: T, data: ChangeData<T>): void => {
    if (!(type in pendingChanges)) {
      pendingChanges[type] = [type]
    }
    if (type !== ChangeType.AddString && Array.isArray(data)) {
      convertStringsToStringReferences(data)
    }
    pendingChanges[type]!.push(data)
  }

  const flush = (): Change[] => {
    const changes: Change[] = []

    // Place all changes into a single array. Because the player always just plays back
    // the changes in order, the ordering of the changes matters; if a dependency can
    // exist between two kinds of change, then the dependent change must come after the
    // change it depends on. This list defines an ordering that ensures that these
    // dependencies are always satisfied.
    ;[
      ChangeType.AddString,
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
    ].forEach((changeType: ChangeType): void => {
      const change = pendingChanges[changeType]
      if (change) {
        changes.push(change as Change)
      }
    })

    pendingChanges = {}

    return changes
  }

  return { add, flush }
}
