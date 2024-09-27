import { assign, find } from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import type {
  BrowserFullSnapshotRecord,
  BrowserRecord,
  FocusRecord,
  MetaRecord,
  VisualViewportRecord,
} from '../../types'
import { IncrementalSource, RecordType } from '../../types'
import { getSerialisedNodeMap } from '../record'
import { applyDomMutation } from './applyDomMutation'
import { applyInputMutation } from './applyInputMutation'
import { applyScrollMutation } from './applyScrollMutation'

interface SqaushingMutatedRecords {
  fullsnapshotRecord: BrowserFullSnapshotRecord
  metaRecord: MetaRecord
  focusRecord: FocusRecord
  visualViewportRecord?: VisualViewportRecord
  frustrationRecord?: BrowserRecord
  cssRulesRecords?: BrowserRecord[]
  mediaInteractionRecords?: BrowserRecord[]
  mouseHoverRecord?: BrowserRecord
  mouseFocusRecord?: BrowserRecord
  mousePositionRecord?: BrowserRecord
}

export function squashRecords(records: BrowserRecord[], squashingTimestamp: TimeStamp): BrowserRecord[] {
  // If any of the basic records is missing, return the original records
  if (records.length === 0) {
    return records
  }

  const serializedNodeMap = getSerialisedNodeMap()
  const squashingMutatedRecords: SqaushingMutatedRecords = {
    fullsnapshotRecord: find(records, (record) => record.type === RecordType.FullSnapshot)!,
    metaRecord: find(records, (record) => record.type === RecordType.Meta)!,
    focusRecord: find(records, (record) => record.type === RecordType.Focus)!,
    visualViewportRecord: find(records, (record) => record.type === RecordType.VisualViewport),
  }

  const unsquashedRecords: BrowserRecord[] = []

  for (const record of records) {
    switch (record.type) {
      case RecordType.Meta:
        break
      case RecordType.FullSnapshot:
        break
      case RecordType.Focus:
        if (record !== squashingMutatedRecords.focusRecord) {
          squashingMutatedRecords.focusRecord = record
        }
        break
      case RecordType.VisualViewport:
        // Maybe we should update MetaRecord width & height
        if (record !== squashingMutatedRecords.visualViewportRecord) {
          squashingMutatedRecords.visualViewportRecord = record
        }
        break
      case RecordType.IncrementalSnapshot:
        switch (record.data.source) {
          case IncrementalSource.Mutation:
            applyDomMutation(serializedNodeMap, record.data)
            break
          case IncrementalSource.Input:
            applyInputMutation(record.data, serializedNodeMap)
            break
          case IncrementalSource.Scroll:
            applyScrollMutation(record.data, serializedNodeMap, squashingMutatedRecords.fullsnapshotRecord)
            break
          case IncrementalSource.StyleSheetRule:
            if (!squashingMutatedRecords.cssRulesRecords) {
              squashingMutatedRecords.cssRulesRecords = [record]
            } else {
              squashingMutatedRecords.cssRulesRecords.push(record)
            }
            break
          case IncrementalSource.MediaInteraction:
            if (!squashingMutatedRecords.mediaInteractionRecords) {
              squashingMutatedRecords.mediaInteractionRecords = [record]
            } else {
              squashingMutatedRecords.mediaInteractionRecords.push(record)
            }
            break
          case IncrementalSource.ViewportResize:
            // Update MetaRecord width & height
            squashingMutatedRecords.metaRecord.data.height = record.data.height
            squashingMutatedRecords.metaRecord.data.width = record.data.width
            // Discard VisualViewportRecord
            delete squashingMutatedRecords.visualViewportRecord
            break
          default:
            unsquashedRecords.push(record)
            break
        }
        break
      default:
        unsquashedRecords.push(record)
        break
    }
  }

  // Update timings of records (add -50 ms) to give timeto unsquashed records
  return finaliseSquashing(squashingMutatedRecords, unsquashedRecords, squashingTimestamp)
}

function finaliseStyleRulesSquashing(cssRulesRecords?: BrowserRecord[]): BrowserRecord | undefined {
  if (!cssRulesRecords) {
    return
  }
  const adds = []
  const removes = []
  let lastRecord
  for (const record of cssRulesRecords) {
    if (record.type !== RecordType.IncrementalSnapshot || record.data.source !== IncrementalSource.StyleSheetRule) {
      continue
    }
    if (record.data.adds) {
      adds.push(...record.data.adds)
    }
    if (record.data.removes) {
      removes.push(...record.data.removes)
    }
    lastRecord = record
  }

  if (lastRecord) {
    if (
      lastRecord.type !== RecordType.IncrementalSnapshot ||
      lastRecord.data.source !== IncrementalSource.StyleSheetRule
    ) {
      return
    }
    lastRecord.data.adds = adds
    lastRecord.data.removes = removes
  }

  return lastRecord
}

function finaliseMediaInteractionSquashing(mediaInteractionRecords?: BrowserRecord[]): BrowserRecord | undefined {
  if (!mediaInteractionRecords) {
    return
  }
  const lastRecord = mediaInteractionRecords[mediaInteractionRecords.length - 1]
  if (
    lastRecord.type !== RecordType.IncrementalSnapshot ||
    lastRecord.data.source !== IncrementalSource.MediaInteraction
  ) {
    return
  }
  if (lastRecord.data.type === 1) {
    return lastRecord
  }
}

function finaliseSquashing(
  state: SqaushingMutatedRecords,
  unsquashedRecords: BrowserRecord[],
  timestamp: TimeStamp
): BrowserRecord[] {
  const squashedRecords: BrowserRecord[] = []
  const styleSheetRuleRecord = finaliseStyleRulesSquashing(state.cssRulesRecords)
  const mediaInteractionRecord = finaliseMediaInteractionSquashing(state.mediaInteractionRecords)

  squashedRecords.push(assign(state.metaRecord, { timestamp }))
  squashedRecords.push(assign(state.focusRecord, { timestamp }))
  squashedRecords.push(assign(state.fullsnapshotRecord, { timestamp }))
  if (state.visualViewportRecord) {
    squashedRecords.push(assign(state.visualViewportRecord, { timestamp }))
  }

  if (styleSheetRuleRecord) {
    squashedRecords.push(assign(styleSheetRuleRecord, { timestamp }))
  }
  if (mediaInteractionRecord) {
    squashedRecords.push(assign(mediaInteractionRecord, { timestamp }))
  }

  squashedRecords
    .concat(unsquashedRecords)
    .sort((r1, r2) => r1.timestamp - r2.timestamp)
    .forEach((record) => {
      record.timestamp = timestamp
    })

    console.log('SQUASHING RESULT', squashedRecords)

  return squashedRecords
}
