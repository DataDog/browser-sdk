// Hex-encodes the complete contents of a WebAssembly `build_id` custom
// section. Toolchains do not all encode this section in the same way, so the
// SDK keeps its contents unchanged instead of interpreting them.

function toHex(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += bytes[i].toString(16).padStart(2, '0')
  }
  return result
}

export function extractWasmBuildId(buildIdSection: ArrayBufferLike): string {
  return toHex(new Uint8Array(buildIdSection))
}
