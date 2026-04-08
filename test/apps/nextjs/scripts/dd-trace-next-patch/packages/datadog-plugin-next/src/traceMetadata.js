'use strict'

/**
 * Returns Datadog trace metadata for RUM<>APM correlation.
 *
 * Call this from your `generateMetadata` function in the root layout to inject
 * `<meta name="dd-trace-id">` and `<meta name="dd-trace-time">` tags into the page.
 * The Datadog RUM SDK reads these on initial page load to link with the server APM trace.
 *
 * Usage:
 * ```js
 * // app/layout.js
 * const { getDatadogTraceMetadata } = require('dd-trace/next')
 *
 * export async function generateMetadata() {
 *   return {
 *     title: 'My App',
 *     ...getDatadogTraceMetadata(),
 *   }
 * }
 * ```
 *
 * Returns a Next.js Metadata-compatible object:
 * { other: { 'dd-trace-id': '<traceId>', 'dd-trace-time': '<timestamp>' } }
 */
function getDatadogTraceMetadata () {
  const tracer = global._ddtrace
  if (!tracer) return {}

  const activeSpan = tracer.scope().active()
  if (!activeSpan) return {}

  const context = activeSpan.context()
  const traceId = context.toTraceId()
  const traceTime = String(Date.now())

  // Generate a span ID that will be used by the browser SDK's document resource span.
  // By setting it as the server root span's parentId, the browser span becomes the
  // root of the trace, with the server span as its child — establishing an explicit
  // parent-child link without relying on timestamps.
  //
  // dd-trace's _parentId must be an object with a .toString(radix) method, matching
  // the Identifier interface used internally. We build one from crypto.randomBytes.
  const bytes = Array.from(require('crypto').randomBytes(8))
  bytes[0] &= 0x7F // ensure positive int64
  const browserSpanId = {
    _buffer: bytes,
    toString (radix) {
      radix = radix || 10
      let high = (bytes[0] * 16777216) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]
      let low = (bytes[4] * 16777216) + (bytes[5] << 16) + (bytes[6] << 8) + bytes[7]
      let str = ''
      do {
        const mod = (high % radix) * 4294967296 + low
        high = Math.floor(high / radix)
        low = Math.floor(mod / radix)
        str = (mod % radix).toString(radix) + str
      } while (high || low)
      return str
    },
    toArray () { return this._buffer },
    toBuffer () { return this._buffer },
    toJSON () { return this.toString() },
    toBigInt () { return BigInt('0x' + this._buffer.map(b => b.toString(16).padStart(2, '0')).join('')) },
    equals (other) {
      for (let i = 0; i < 8; i++) { if (this._buffer[i] !== (other._buffer || other)[i]) return false }
      return true
    }
  }
  // Find the trace's root span (parentId === 0 or null) and re-parent it.
  // The active span may be next.request, but the actual root is web.request.
  const trace = context._trace
  if (trace && trace.started) {
    for (const span of trace.started) {
      const spanCtx = span.context()
      if (!spanCtx._parentId) {
        spanCtx._parentId = browserSpanId
        break
      }
    }
  } else {
    context._parentId = browserSpanId
  }

  return {
    other: {
      'dd-trace-id': traceId,
      'dd-trace-time': traceTime,
      'dd-root-span-id': browserSpanId.toString(10)
    }
  }
}

module.exports = { getDatadogTraceMetadata }
