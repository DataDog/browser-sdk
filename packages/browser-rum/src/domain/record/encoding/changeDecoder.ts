import { ChangeType, StringRole } from '../../../types'
import type {
  AddDocTypeNodeChange,
  AddRoleAnnotatedStringsChange,
  AddElementNodeChange,
  AddNodeChange,
  AddStyleSheetChange,
  AddTextNodeChange,
  AttributeAssignmentOrDeletion,
  AttributeChange,
  BrowserChangeRecord,
  BrowserFullSnapshotChangeRecord,
  Change,
  InputValueChange,
  StyleSheetRules,
  TextChange,
} from '../../../types'
import type { StringTable } from './stringTable'
import { createStringTable } from './stringTable'

/**
 * ChangeDecoder converts a BrowserChangeRecord, or a stream of BrowserChangeRecords, into
 * a more human-readable form by:
 * - Removing the changes that define string table entries.
 * - Replacing string table references in all other changes with their literal values.
 *
 * This makes it easier to visualize the contents of BrowserChangeRecords or to write test
 * expectations against the record's content.
 */
export interface ChangeDecoder {
  decode(record: BrowserChangeRecord): BrowserChangeRecord
  decode(record: BrowserFullSnapshotChangeRecord): BrowserFullSnapshotChangeRecord
  decode(
    record: BrowserChangeRecord | BrowserFullSnapshotChangeRecord
  ): BrowserChangeRecord | BrowserFullSnapshotChangeRecord

  stringTable: StringTable
}

export interface ChangeDecoderOptions {
  /**
   * If true, accept the string representations that the ChangeEncoder no longer produces:
   * - AddStringChange (rather than AddRoleAnnotatedStringsChange)
   * - StringLiteral (rather than RoleAnnotatedStringLiteral)
   *
   * When this option is false (the default), ChangeDecoder will throw when it encounters
   * these obsolete string representations.
   *
   * In the future, we expect that certain Datadog features will be unavailable for
   * recordings which include obsolete string representations, so it's important to be
   * sure that we don't accidentally generate them.
   */
  allowObsoleteStringRepresentations?: boolean

  /**
   * If true, decode string references to RoleAnnotatedStringLiteral objects. This allows
   * you to inspect the recorded role annotations. Defaults to false.
   */
  keepRoles?: boolean
}

export function createChangeDecoder({
  allowObsoleteStringRepresentations = false,
  keepRoles = false,
}: ChangeDecoderOptions = {}): ChangeDecoder {
  const self = {
    decode(
      record: BrowserChangeRecord | BrowserFullSnapshotChangeRecord
    ): BrowserChangeRecord | BrowserFullSnapshotChangeRecord {
      return decodeChangeRecord(record, self.stringTable, allowObsoleteStringRepresentations)
    },

    stringTable: createStringTable(allowObsoleteStringRepresentations, keepRoles),
  } as ChangeDecoder

  return self
}

function decodeChangeRecord(
  record: BrowserChangeRecord | BrowserFullSnapshotChangeRecord,
  stringTable: StringTable,
  allowObsoleteStringRepresentations: boolean
): BrowserChangeRecord | BrowserFullSnapshotChangeRecord {
  const decodedData: Change[] = []

  for (const change of record.data) {
    switch (change[0]) {
      case ChangeType.AddString:
        if (!allowObsoleteStringRepresentations) {
          throw new Error('Obsolete AddString change: string table entries are defined by role now')
        }

        // Update the string table.
        for (let i = 1; i < change.length; i++) {
          stringTable.add(change[i] as string, StringRole.Default)
        }

        // Deliberately don't include this change in the decoded record.
        break

      case ChangeType.AddRoleAnnotatedStrings:
        // Update the string table, remembering the role each run was defined in so that the
        // decoded record can carry it when the decoder was asked to keep roles.
        for (let i = 1; i < change.length; i++) {
          const [role, ...newStrings] = change[i] as AddRoleAnnotatedStringsChange
          for (const newString of newStrings) {
            stringTable.add(newString, role)
          }
        }

        // Deliberately don't include this change in the decoded record.
        break

      case ChangeType.AddNode: {
        const decoded: [typeof ChangeType.AddNode, ...AddNodeChange[]] = [ChangeType.AddNode]
        for (let i = 1; i < change.length; i++) {
          decoded.push(decodeAddNodeChange(change[i] as AddNodeChange, stringTable))
        }
        decodedData.push(decoded)
        break
      }

      case ChangeType.RemoveNode:
        decodedData.push(change)
        break

      case ChangeType.Attribute: {
        const decoded: [typeof ChangeType.Attribute, ...AttributeChange[]] = [ChangeType.Attribute]
        for (let i = 1; i < change.length; i++) {
          decoded.push(decodeAttributeChange(change[i] as AttributeChange, stringTable))
        }
        decodedData.push(decoded)
        break
      }

      case ChangeType.Text: {
        const decoded: [typeof ChangeType.Text, ...TextChange[]] = [ChangeType.Text]
        for (let i = 1; i < change.length; i++) {
          decoded.push(decodeTextChange(change[i] as TextChange, stringTable))
        }
        decodedData.push(decoded)
        break
      }

      case ChangeType.InputValue: {
        const decoded: [typeof ChangeType.InputValue, ...InputValueChange[]] = [ChangeType.InputValue]
        for (let i = 1; i < change.length; i++) {
          decoded.push(decodeInputValueChange(change[i] as InputValueChange, stringTable))
        }
        decodedData.push(decoded)
        break
      }

      case ChangeType.Size:
      case ChangeType.ScrollPosition:
      case ChangeType.AttachedStyleSheets:
      case ChangeType.MediaPlaybackState:
      case ChangeType.VisualViewport:
      case ChangeType.InputSelection:
        decodedData.push(change)
        break

      case ChangeType.AddStyleSheet: {
        const decoded: [typeof ChangeType.AddStyleSheet, ...AddStyleSheetChange[]] = [ChangeType.AddStyleSheet]
        for (let i = 1; i < change.length; i++) {
          decoded.push(decodeAddStyleSheetChange(change[i] as AddStyleSheetChange, stringTable))
        }
        decodedData.push(decoded)
        break
      }

      case ChangeType.ClearStrings:
        // This change type exists in the schema, but nothing generates it yet.
        throw new Error(`Unsupported ChangeType: ${change[0]}`)

      default:
        change satisfies never
        throw new Error(`Unsupported ChangeType: ${change[0] as any}`)
    }
  }

  return { ...record, data: decodedData }
}

function decodeAddNodeChange(change: AddNodeChange, stringTable: StringTable): AddNodeChange {
  const insertionPoint = change[0]

  // Which kind of node this is has to be decided from the node name on its own, but the name that
  // goes into the decoded record is the annotated one.
  const nodeName = stringTable.decode(change[1])
  const decodedNodeName = stringTable.decodeAnnotated(change[1])

  switch (nodeName) {
    case '#cdata-section':
    case '#document':
    case '#document-fragment':
    case '#shadow-root':
      return [insertionPoint, decodedNodeName]

    case '#doctype': {
      const [, , name, publicId, systemId] = change as AddDocTypeNodeChange
      // The schema says an annotated '#doctype' carries the node name role, but the role here is
      // whatever the record gave it, which is exactly what a reader wants to see. The cast keeps a
      // record that got the role wrong legible, rather than hiding it.
      return [
        insertionPoint,
        decodedNodeName,
        stringTable.decodeAnnotated(name),
        stringTable.decodeAnnotated(publicId),
        stringTable.decodeAnnotated(systemId),
      ] as AddDocTypeNodeChange
    }

    case '#text': {
      const [, , textContent] = change as AddTextNodeChange
      // Cast for the same reason as '#doctype' above.
      return [insertionPoint, decodedNodeName, stringTable.decodeAnnotated(textContent)] as AddTextNodeChange
    }

    default: {
      const decodedChange: AddElementNodeChange = [insertionPoint, decodedNodeName]

      const [, , ...attrs] = change as AddElementNodeChange
      for (const [name, value] of attrs) {
        decodedChange.push([stringTable.decodeAnnotated(name), stringTable.decodeAnnotated(value)])
      }

      return decodedChange
    }
  }
}

function decodeAttributeChange(change: AttributeChange, stringTable: StringTable): AttributeChange {
  const [nodeId, ...mutations] = change

  const decodedMutations: AttributeAssignmentOrDeletion[] = mutations.map((mutation) => {
    if (mutation.length === 1) {
      return [stringTable.decodeAnnotated(mutation[0])]
    }
    return [stringTable.decodeAnnotated(mutation[0]), stringTable.decodeAnnotated(mutation[1])]
  })

  const decodedChange: AttributeChange = [nodeId]
  decodedChange.push(...decodedMutations)
  return decodedChange
}

function decodeTextChange(change: TextChange, stringTable: StringTable): TextChange {
  return [change[0], stringTable.decodeAnnotated(change[1])]
}

function decodeInputValueChange(change: InputValueChange, stringTable: StringTable): InputValueChange {
  return [change[0], stringTable.decodeAnnotated(change[1])]
}

function decodeAddStyleSheetChange(change: AddStyleSheetChange, stringTable: StringTable): AddStyleSheetChange {
  const rules = change[0]
  const decodedRules: StyleSheetRules = Array.isArray(rules)
    ? rules.map((rule) => stringTable.decodeAnnotated(rule))
    : stringTable.decodeAnnotated(rules)

  if (change.length === 1) {
    return [decodedRules]
  }

  const decodedMediaList = change[1].map((item) => stringTable.decodeAnnotated(item))

  if (change.length === 2) {
    return [decodedRules, decodedMediaList]
  }

  return [decodedRules, decodedMediaList, change[2]]
}
