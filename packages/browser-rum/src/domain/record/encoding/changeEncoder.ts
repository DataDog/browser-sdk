import type { AddRoleAnnotatedStringsChange, Change, RoleAnnotatedStringLiteral } from '../../../types'
import { ChangeType, StringRole } from '../../../types'
import { createString } from './roles'
import { StringIdConstants } from './stringIds'
import type { StringId, StringIds } from './stringIds'

type ChangeData<T extends ChangeType> =
  Extract<Change, [T, ...unknown[]]> extends [T, ...infer Rest] ? Rest[number] : never

type StringTableChangeTypes =
  typeof ChangeType.AddString | typeof ChangeType.AddRoleAnnotatedStrings | typeof ChangeType.ClearStrings

/**
 * The change operations a caller can add. Callers are not allowed to generate change
 * operations that manipulate the string table; that's the exclusive responsibility of the
 * encoder.
 */
type EncodableChangeType = Exclude<ChangeType, StringTableChangeTypes>

/**
 * ChangeEncoder handles the low-level work of building compact, optimized sequences of
 * Changes. In particular, it:
 * - Converts literal strings to string table references, to eliminate the duplication
 * of transferring the same strings repeatedly.
 * - Groups the strings it defines by role to minimize the cost of transmitting role information.
 * - Sorts the busiest string groups first, so that the strings which are referenced most
 * frequently tend to get ids which have fewer digits and are thus cheaper to reference.
 * - Groups changes by type, instead of transmitting them strictly in order, so that we
 * can avoid transmitting a separate Change data structure with an independent type tag
 * for each small mutation. (It's safe to do this for changes that occur within the same
 * SerializationTransaction since they logically happen at the same time.)
 * - Clears the string table when it reaches its soft maximum size, so that there is always
 * room for the strings the encoder needs to define. Strings are therefore never transmitted
 * outside of the string table.
 */
export interface ChangeEncoder {
  /**
   * Encode a Change of the given type and add it to the internal buffer.
   *
   * The encoder takes ownership of `data`; the caller must not modify it after adding it.
   */
  add<T extends EncodableChangeType>(type: T, data: ChangeData<T>): void

  /** Flush the internal buffer, returning all Changes added since the last flush(). */
  flush(): Change[]
}

export function createChangeEncoder(stringIds: StringIds): ChangeEncoder {
  // Changes are encoded in runs. A run ends when the string table reaches its maximum
  // size and is cleared; the changes in each run thus always share a single string id
  // namespace. The currently-active run ends when the caller flushes the encoder.

  // The changes of the runs that have already ended, waiting for the caller to flush them.
  let flushedChanges: Change[] = []

  // The run that the changes being added now belong to.
  let run = createRunChangeEncoder(stringIds)

  // Ends the current run, appending the changes it encoded to those of the runs before it,
  // and starts a new one.
  const endRun = (): void => {
    run.flushInto(flushedChanges)
    run = createRunChangeEncoder(stringIds)
  }

  // Clears the string table. This has the effect of creating a new string id namespace, so
  // we also need to end the current run to ensure that the changes we've generated so far
  // play back in the context of the previous namespace.
  const clearStringTable = (): void => {
    endRun()
    flushedChanges.push([ChangeType.ClearStrings])
    stringIds.clear()
  }

  const add = <T extends EncodableChangeType>(type: T, data: ChangeData<T>): void => {
    run.add(type, data)

    // If this change pushed the string table past its soft maximum size, we need to clear
    // the string table.
    if (stringIds.size + run.pendingStringCount >= Number(StringIdConstants.SOFT_MAX_SIZE)) {
      clearStringTable()
    }
  }

  const flush = (): Change[] => {
    endRun()

    const changes = flushedChanges
    flushedChanges = []

    return changes
  }

  return { add, flush }
}

type StringTableUpdates = [typeof ChangeType.AddRoleAnnotatedStrings, ...AddRoleAnnotatedStringsChange[]]

/** A string which is waiting for a string table id. */
interface PendingString {
  /** The string itself, along with the role it belongs to. */
  literal: RoleAnnotatedStringLiteral
  /** The id this string was given; undefined until string table ids have been assigned. */
  id: StringId | undefined
}

/** A group of strings with the same role which are waiting for string table ids. */
interface PendingStringGroup {
  /** The role all of these strings belong to. */
  role: StringRole
  /** The strings, keyed by value, in the order they were first encountered. */
  strings: Map<string, PendingString>
  /** How many times the changes being encoded refer to a string in this run. */
  references: number
}

/**
 * RunChangeEncoder encodes the changes of a single run for ChangeEncoder. Changes within
 * a run are grouped together to optimize their representation, and they share a common
 * string id namespace.
 */
interface RunChangeEncoder {
  /**
   * Encode a Change of the given type and add it to the run.
   *
   * The run takes ownership of `data`; the caller must not modify it after adding it.
   */
  add<T extends EncodableChangeType>(type: T, data: ChangeData<T>): void

  /**
   * End the run, appending the Changes it encoded to the given output array. The run must
   * not be used again afterwards.
   */
  flushInto(output: Change[]): void

  /** The number of strings the run will add to the string table when it ends. */
  get pendingStringCount(): number
}

function createRunChangeEncoder(stringIds: StringIds): RunChangeEncoder {
  // The changes added during this run, grouped by type.
  const pendingChanges: Partial<Record<ChangeType, unknown[]>> = {}

  // Every string in the changes added during this run which isn't in the string table yet,
  // grouped by role.
  const pendingGroups = new Map<StringRole, PendingStringGroup>()

  // The changes added during this run that hold a string with no id yet, and so need a
  // second pass once the run has handed out the ids. Tracking them minimizes the amount
  // of work the second pass has to do; many changes, especially after the full snapshot,
  // don't introduce any new strings and hence don't require a second pass.
  const unresolvedChanges: unknown[][] = []

  // How many strings pendingGroups holds.
  let pendingStringCount = 0

  // Set while a change is being encoded if any of its strings has no id yet.
  let changeHasPendingStrings = false

  // The reference that stands in for a string in the change data: its id, when the string
  // is already in the string table, and a PendingString when it isn't. The ids depend on
  // how the strings are grouped and on how often each of them is referenced, so we can't
  // greedily assign ids for new strings as soon as we encounter them; we need to wait for
  // the run to end.
  const referenceString = (literal: RoleAnnotatedStringLiteral): StringId | PendingString => {
    const id = stringIds.get(literal)
    if (id !== undefined) {
      return id
    }

    changeHasPendingStrings = true

    let group = pendingGroups.get(literal.role)
    if (!group) {
      group = { role: literal.role, strings: new Map(), references: 0 }
      pendingGroups.set(literal.role, group)
    }
    group.references++

    const existingPendingString = group.strings.get(literal.string)
    if (existingPendingString) {
      return existingPendingString
    }

    const pendingString: PendingString = { literal, id: undefined }
    group.strings.set(literal.string, pendingString)
    pendingStringCount++
    return pendingString
  }

  // A helper that searches for strings in arbitrarily-nested arrays and replaces each one it
  // finds with a reference to it.
  const encodeStrings = (array: any[]): void => {
    for (let index = 0, length = array.length; index < length; index++) {
      const item = array[index]
      if (typeof item === 'string') {
        array[index] = referenceString(createString(StringRole.Default, item))
      } else if (Array.isArray(item)) {
        encodeStrings(item)
      } else if (isRoleAnnotatedStringLiteral(item)) {
        array[index] = referenceString(item)
      }
    }
  }

  // Inserts the strings that aren't in the string table yet, positionally assigning them
  // ids, and returns the resulting serialized string table update.
  const generateStringTableUpdates = (): StringTableUpdates | undefined => {
    if (pendingGroups.size === 0) {
      return undefined
    }

    // AddRoleAnnotatedStrings operations logically append to the string table, and the id
    // of each string is just its index in the table. Because a string table reference
    // costs one byte per decimal digit of the target string's index, we sort the groups
    // so that more frequently referenced groups appear first; this tends to reduce the
    // cost of string table references overall in the recording.
    const stringTableUpdates: StringTableUpdates = [ChangeType.AddRoleAnnotatedStrings]
    for (const group of Array.from(pendingGroups.values()).sort(byDescendingReferences)) {
      const update: AddRoleAnnotatedStringsChange = [group.role]
      for (const pendingString of group.strings.values()) {
        pendingString.id = stringIds.getOrInsert(pendingString.literal)
        update.push(pendingString.literal.string)
      }
      stringTableUpdates.push(update)
    }

    return stringTableUpdates
  }

  const add = <T extends EncodableChangeType>(type: T, data: ChangeData<T>): void => {
    if (!(type in pendingChanges)) {
      pendingChanges[type] = [type]
    }

    // Not every kind of change data is an array; a RemoveNode change is a bare node id.
    if (Array.isArray(data)) {
      changeHasPendingStrings = false
      encodeStrings(data)
      if (changeHasPendingStrings) {
        unresolvedChanges.push(data)
      }
    }

    pendingChanges[type]!.push(data)
  }

  const flushInto = (output: Change[]): void => {
    // String table updates have to come before any change that refers to them.
    const stringTableUpdates = generateStringTableUpdates()
    if (stringTableUpdates) {
      output.push(stringTableUpdates)
    }

    // Every string has an id assigned now, so we can resolve the pending strings.
    for (const change of unresolvedChanges) {
      resolvePendingStrings(change)
    }

    // Place all changes into a single array. Because the player always just plays back
    // the changes in order, the ordering of the changes matters; if a dependency can
    // exist between two kinds of change, then the dependent change must come after the
    // change it depends on. This list defines an ordering that ensures that these
    // dependencies are always satisfied.
    //
    // Only the changes of this run need to be ordered this way. Callers add changes in an
    // order that already satisfies their dependencies, so a change can only depend on one
    // that was added before it, which is one in this run or in a run that already ended;
    // it's grouping the changes by type that reorders them, and that happens within a run.
    ;[
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
    ].forEach((changeType: ChangeType): void => {
      const change = pendingChanges[changeType]
      if (change) {
        output.push(change as Change)
      }
    })
  }

  return {
    add,
    flushInto,
    get pendingStringCount(): number {
      return pendingStringCount
    },
  }
}

/**
 * Replaces every string in the given change with the id it was assigned. A run gives every
 * pending string an id before it resolves anything, so by this point they all have one.
 */
function resolvePendingStrings(array: any[]): void {
  for (let index = 0, length = array.length; index < length; index++) {
    const item = array[index]
    if (Array.isArray(item)) {
      resolvePendingStrings(item)
    } else if (isPendingString(item)) {
      array[index] = item.id
    }
  }
}

function byDescendingReferences(a: PendingStringGroup, b: PendingStringGroup): number {
  return b.references - a.references
}

function isRoleAnnotatedStringLiteral(item: unknown): item is RoleAnnotatedStringLiteral {
  return typeof item === 'object' && item !== null && 'string' in item
}

/** Every object left in change data once encodeStrings() has been over it is one of these. */
function isPendingString(item: unknown): item is PendingString {
  return typeof item === 'object' && item !== null && 'literal' in item
}
