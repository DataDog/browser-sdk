import { BufferedObservable, noop } from '@datadog/js-core/util'
import {
  EARLY_PHASES_BUFFER_CAPACITY,
  type EarlyWebSocketCollection,
} from '../src/domain/webSocket/webSocketCollection'

export const noopEarlyWebSocketCollection: EarlyWebSocketCollection = {
  // notifies nothing, so nothing is ever replayed
  phases: new BufferedObservable(EARLY_PHASES_BUFFER_CAPACITY),
  stop: noop,
  handOff: noop,
}
