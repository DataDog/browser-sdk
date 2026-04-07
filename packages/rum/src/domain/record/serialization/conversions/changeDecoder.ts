import { ChangeType } from 'rum-events-format/session-replay-browser'
import type {
  AddDocTypeNodeChange,
  AddElementNodeChange,
  AddNodeChange,
  AddStyleSheetChange,
  AddTextNodeChange,
  AttributeAssignmentOrDeletion,
  AttributeChange,
  BrowserChangeRecord,
  BrowserFullSnapshotChangeRecord,
  Change,
  StyleSheetRules,
  TextChange,
} from 'rum-events-format/session-replay-browser'
import type { StringTable } from './stringTable'
import { createStringTable } from './stringTable'

/**
 * ChangeDecoder converts a BrowserChangeRecord, or a stream of BrowserChangeRecords, into
 * a more human-readable form by:
 * - Removing AddString changes (string table definitions).
 * - Replacing string table references in all other changes with their literal values.
 *
 * This makes it easier to visualize the contents of BrowserChangeRecords or to write test
 * expectations against the record's content.
 */
export interface ChangeDecoder {
  decode(
    record: BrowserChangeRecord | BrowserFullSnapshotChangeRecord
  ): BrowserChangeRecord | BrowserFullSnapshotChangeRecord

  stringTable: StringTable
}

export function createChangeDecoder(): ChangeDecoder {
  const self: ChangeDecoder = {
    decode(
      record: BrowserChangeRecord | BrowserFullSnapshotChangeRecord
    ): BrowserChangeRecord | BrowserFullSnapshotChangeRecord {
      return decodeChangeRecord(record, self.stringTable)
    },

    stringTable: createStringTable(),
  }

  return self
}

function decodeChangeRecord(
  record: BrowserChangeRecord | BrowserFullSnapshotChangeRecord,
  stringTable: StringTable
): BrowserChangeRecord | BrowserFullSnapshotChangeRecord {
  const decodedData: Change[] = []

  for (const change of record.data) {
    switch (change[0]) {
      case ChangeType.AddString:
        // Update the string table.
        for (let i = 1; i < change.length; i++) {
          stringTable.add(change[i] as string)
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

      case ChangeType.Size:
      case ChangeType.ScrollPosition:
      case ChangeType.AttachedStyleSheets:
      case ChangeType.MediaPlaybackState:
      case ChangeType.VisualViewport:
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

      default:
        change satisfies never
        throw new Error(`Unsupported ChangeType: ${change[0] as any}`)
    }
  }

  return { ...record, data: decodedData }
}

function decodeAddNodeChange(change: AddNodeChange, stringTable: StringTable): AddNodeChange {
  const insertionPoint = change[0]
  const nodeName = stringTable.decode(change[1])

  switch (nodeName) {
    case '#cdata-section':
    case '#document':
    case '#document-fragment':
    case '#shadow-root':
      return [insertionPoint, nodeName]

    case '#doctype': {
      const [, , name, publicId, systemId] = change as AddDocTypeNodeChange
      return [
        insertionPoint,
        '#doctype',
        stringTable.decode(name),
        stringTable.decode(publicId),
        stringTable.decode(systemId),
      ]
    }

    case '#text': {
      const [, , textContent] = change as AddTextNodeChange
      return [insertionPoint, '#text', stringTable.decode(textContent)]
    }

    default: {
      const decodedChange: AddElementNodeChange = [insertionPoint, nodeName]

      const [, , ...attrs] = change as AddElementNodeChange
      for (const [name, value] of attrs) {
        decodedChange.push([stringTable.decode(name), stringTable.decode(value)])
      }

      return decodedChange
    }
  }
}

function decodeAttributeChange(change: AttributeChange, stringTable: StringTable): AttributeChange {
  const [nodeId, ...mutations] = change

  const decodedMutations: AttributeAssignmentOrDeletion[] = mutations.map((mutation) => {
    if (mutation.length === 1) {
      return [stringTable.decode(mutation[0])]
    }
    return [stringTable.decode(mutation[0]), stringTable.decode(mutation[1])]
  })

  const decodedChange: AttributeChange = [nodeId]
  decodedChange.push(...decodedMutations)
  return decodedChange
}

function decodeTextChange(change: TextChange, stringTable: StringTable): TextChange {
  return [change[0], stringTable.decode(change[1])]
}

function decodeAddStyleSheetChange(change: AddStyleSheetChange, stringTable: StringTable): AddStyleSheetChange {
  const rules = change[0]
  const decodedRules: StyleSheetRules = Array.isArray(rules)
    ? rules.map((rule) => stringTable.decode(rule))
    : stringTable.decode(rules)

  if (change.length === 1) {
    return [decodedRules]
  }

  const decodedMediaList = change[1].map((item) => stringTable.decode(item))

  if (change.length === 2) {
    return [decodedRules, decodedMediaList]
  }

  return [decodedRules, decodedMediaList, change[2]]
}
