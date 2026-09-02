// Parses the contents of a WebAssembly `build_id` custom section. The section
// starts with the build ID length encoded as an unsigned LEB128, followed by
// the build ID bytes.

function readLEB128Unsigned(bytes: Uint8Array): { value: number; nextOffset: number } | undefined {
  let value = 0
  let shift = 0

  for (let offset = 0; offset < bytes.length; offset++) {
    const byte = bytes[offset]
    value += (byte % 0x80) * 2 ** shift
    if (byte < 0x80) {
      return { value, nextOffset: offset + 1 }
    }
    shift += 7
    if (shift > 28) {
      return undefined
    }
  }

  return undefined
}

function toHex(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i++) {
    result += bytes[i].toString(16).padStart(2, '0')
  }
  return result
}

export function extractWasmBuildId(buildIdSection: ArrayBufferLike): string {
  const bytes = new Uint8Array(buildIdSection)
  const buildIdLength = readLEB128Unsigned(bytes)

  if (!buildIdLength || buildIdLength.nextOffset + buildIdLength.value !== bytes.length) {
    return ''
  }

  return toHex(bytes.subarray(buildIdLength.nextOffset))
}
