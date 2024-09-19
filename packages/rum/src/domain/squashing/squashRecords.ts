import type { BrowserRecord } from '../../types';
import { IncrementalSource, RecordType } from '../../types';
import { getSerialisedNodeMap } from '../record';
import { applyDomMutation } from './applyDomMutation';
import { applyInputMutation } from './applyInputMutation';
import { applyScrollMutation } from './applyScrollMutation';

export function squashRecords(records: BrowserRecord[], squashingTimestamp: number): BrowserRecord[] {
    const serializedNodeMap = getSerialisedNodeMap()
    const squashedRecords: BrowserRecord[] = []

    // Find FuulSnapshotRecord
    const fullsnapshotRecord = records.find((record) => record.type === RecordType.FullSnapshot)!
    // Find MetaRecord
    const metaRecord = records.find((record) => record.type === RecordType.Meta)!
    // Find Last FocusRecord
    const focusRecord = records.find((record) => record.type === RecordType.Focus)!
    // Find VisualViewportRecord
    const visualViewportRecord = records.find((record) => record.type === RecordType.VisualViewport)!
    for (const record of records) {
        switch (record.type) {
            case RecordType.IncrementalSnapshot:
                switch (record.data.source) {
                    case IncrementalSource.MouseInteraction:
                    case IncrementalSource.TouchMove:
                        squashedRecords.push(record)
                        break
                    case IncrementalSource.Mutation:
                        applyDomMutation(serializedNodeMap, record.data)
                        break
                    case IncrementalSource.Input:
                        applyInputMutation(record.data, serializedNodeMap)
                        break
                    case IncrementalSource.Scroll:
                        applyScrollMutation(record.data, serializedNodeMap, fullsnapshotRecord)
                        break
                    default:
                        break
                }
        }
    }

    // Update timings of records (add -50 ms) to give timeto unsquashed records
    return squashedRecords;
}