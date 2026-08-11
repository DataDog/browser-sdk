// Minimal wasm binary parser to extract `build_id` from a wasm module's
// custom sections.
//
// Tries (in priority order):
//   1. `build_id` custom section (Emscripten's convention with `-gseparate-dwarf`):
//      payload bytes are the build ID directly.
//   2. `external_debug_info` custom section (the link from a stripped artefact
//      to its companion debug file): the build ID is typically encoded at the
//      end of the payload; we take the trailing 16 bytes as a pragmatic default.
//
// Returns an empty string if neither section is present (e.g. Rust wasm-bindgen
// output, or Emscripten without `-gseparate-dwarf`).

function readLEB128Unsigned(bytes: Uint8Array, offset: number): { value: number; nextOffset: number } {
  let value = 0
  let shift = 0
  let cursor = offset
  while (cursor < bytes.length) {
    const byte = bytes[cursor++]
    value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: cursor }
    }
    shift += 7
    if (shift > 28) {
      // Bail on absurdly large LEB128 — shouldn't happen for valid wasm section sizes.
      return { value: 0, nextOffset: bytes.length }
    }
  }
  return { value: 0, nextOffset: bytes.length }
}

function toHex(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += bytes[i].toString(16).padStart(2, '0')
  }
  return result
}

const CUSTOM_SECTION_ID = 0
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d]

export function extractWasmBuildId(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 8) {
    return ''
  }
  for (let i = 0; i < WASM_MAGIC.length; i++) {
    if (bytes[i] !== WASM_MAGIC[i]) {
      return ''
    }
  }

  let offset = 8 // skip magic (4) + version (4)
  let externalDebugInfoPayload: Uint8Array | null = null
  const decoder = new TextDecoder('utf-8')

  while (offset < bytes.length) {
    const sectionId = bytes[offset++]
    const { value: sectionSize, nextOffset: afterSize } = readLEB128Unsigned(bytes, offset)
    offset = afterSize
    const sectionEnd = offset + sectionSize

    if (sectionId === CUSTOM_SECTION_ID) {
      const { value: nameLen, nextOffset: afterNameLen } = readLEB128Unsigned(bytes, offset)
      const name = decoder.decode(bytes.subarray(afterNameLen, afterNameLen + nameLen))
      const payload = bytes.subarray(afterNameLen + nameLen, sectionEnd)

      if (name === 'build_id') {
        return toHex(payload)
      }
      if (name === 'external_debug_info') {
        // Defer — only use if no standalone build_id is found later.
        externalDebugInfoPayload = payload
      }
    }

    offset = sectionEnd
    if (offset > bytes.length) {
      break
    }
  }

  if (externalDebugInfoPayload && externalDebugInfoPayload.length > 0) {
    // The trailing portion is the build ID. Default to last 16 bytes; if the
    // payload is shorter, take the whole thing.
    const idLen = Math.min(16, externalDebugInfoPayload.length)
    return toHex(externalDebugInfoPayload.subarray(externalDebugInfoPayload.length - idLen))
  }

  return ''
}
