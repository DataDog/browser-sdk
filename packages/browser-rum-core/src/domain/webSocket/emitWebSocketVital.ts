import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { getPhaseClocks, serializeWebSocketVital } from './serializeWebSocketVital'
import type { TrackedConnectionState } from './trackedConnection'

/**
 * Reports one phase of one connection. The state already holds the phase clocks and snapshot
 * version the vital needs; open reports must be written with `recordReport` first so the
 * snapshot freezes at the vital's date.
 *
 * Emitted straight onto the life cycle rather than through vitalCollection: a WebSocket vital is
 * an instant, zero-duration event, so the duration-vital frozen-page guard has nothing to reject —
 * and rejecting one would let a frozen page suppress the periodic report built to detect it.
 */
export function emitWebSocketVital(lifeCycle: LifeCycle, instance: WebSocket, state: TrackedConnectionState) {
  lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
    rawRumEvent: serializeWebSocketVital(state),
    startClocks: getPhaseClocks(state),
    domainContext: { webSocket: instance },
  })
}
