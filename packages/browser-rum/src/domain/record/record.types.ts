import type { BrowserRecord } from '../../types'
import type { SerializationStats } from './serialization'

export type EmitRecordCallback<Record extends BrowserRecord = BrowserRecord> = (record: Record) => void
export type EmitStatsCallback = (stats: SerializationStats) => void
