import type { RecordBuffer } from './recordBuffer'
import { createRecordBuffer } from './recordBuffer'

export type SessionReplayPlayerStatus = 'loading' | 'waiting-for-full-snapshot' | 'ready' | 'no-sandbox-build' | 'error'

export interface SessionReplayPlayerState {
  status: SessionReplayPlayerStatus
  recordCount: number
  excludeMouseMovements: boolean
}

/** The player's live state. Each change publishes a new `SessionReplayPlayerState`. */
export interface PlayerStateStore {
  readonly bufferedRecords: RecordBuffer
  excludeMouseMovements: boolean
  status: SessionReplayPlayerStatus
}

export interface PlayerStateStoreOptions {
  excludeMouseMovements: boolean
  setPlayerState: (state: SessionReplayPlayerState) => void
}

export function createPlayerStateStore({
  excludeMouseMovements: initialExcludeMouseMovements,
  setPlayerState,
}: PlayerStateStoreOptions): PlayerStateStore {
  const bufferedRecords = createRecordBuffer()
  let excludeMouseMovements = initialExcludeMouseMovements
  let status: SessionReplayPlayerStatus = 'loading'

  const notifyPlayerState = () =>
    setPlayerState({
      status,
      recordCount: bufferedRecords.getCount(),
      excludeMouseMovements,
    })

  bufferedRecords.addListener(notifyPlayerState)
  notifyPlayerState()

  return {
    bufferedRecords,
    get excludeMouseMovements(): boolean {
      return excludeMouseMovements
    },
    set excludeMouseMovements(value: boolean) {
      if (value === excludeMouseMovements) {
        return
      }
      excludeMouseMovements = value
      notifyPlayerState()
    },
    get status(): SessionReplayPlayerStatus {
      return status
    },
    set status(value: SessionReplayPlayerStatus) {
      if (value === status) {
        return
      }
      status = value
      notifyPlayerState()
    },
  }
}
