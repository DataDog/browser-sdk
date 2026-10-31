import { globalObject, isIndexableObject } from '@datadog/js-core/util'

export function resetRumBuffer() {
  const bufferGlobal = globalObject as typeof globalObject & { __DD_RUM_BUFFER__?: unknown }
  const buffer = bufferGlobal.__DD_RUM_BUFFER__
  if (isIndexableObject(buffer) && typeof buffer.stop === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    buffer.stop()
  }
  delete bufferGlobal.__DD_RUM_BUFFER__
}
