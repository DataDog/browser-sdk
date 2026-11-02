import { noop } from '@datadog/js-core/util'
import type { EarlyWebSocketCollection } from '../src/domain/webSocket/webSocketCollection'

export const noopEarlyWebSocketCollection: EarlyWebSocketCollection = {
  // keeps nothing, so nothing is ever drained
  buffer: { register: () => false, drain: noop, clear: noop },
  stop: noop,
  handOff: noop,
}
