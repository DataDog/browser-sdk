import { inflate } from 'pako'

// Zlib streams using a default compression are starting with bytes 120 156 (0x78 0x9c)
// https://stackoverflow.com/a/9050274
const Z_LIB_MAGIC_BYTES = 0x789c

export async function readFormData<T>(formData: FormData): Promise<T> {
  const entries = getEntries(formData)
  const data: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(entries)) {
    if (value instanceof Blob) {
      data[key] = await readJsonBlob(value)
    } else {
      data[key] = value
    }
  }

  return data as T
}

function getEntries(payload: FormData) {
  const entries = {} as Record<string, FormDataEntryValue>
  payload.forEach((data, key) => {
    entries[key] = data
  })
  return entries
}

function isZlibCompressed(buffer: ArrayBuffer) {
  return new DataView(buffer).getUint16(0) === Z_LIB_MAGIC_BYTES
}

function readJsonBlob<T>(blob: Blob): Promise<T> {
  // Safari Mobile 14 should support blob.text() or blob.arrayBuffer() but the APIs are not defined on the safari
  // provided by browserstack, so we still need to use a FileReader for now.
  // https://caniuse.com/mdn-api_blob_arraybuffer
  // https://caniuse.com/mdn-api_blob_text
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.addEventListener('loadend', () => {
      const buffer = reader.result as ArrayBuffer
      const decompressed = isZlibCompressed(buffer) ? inflate(buffer) : buffer
      const decoded = new TextDecoder().decode(decompressed)
      const deserialized = JSON.parse(decoded)

      resolve(deserialized as T)
    })
    reader.readAsArrayBuffer(blob)
  })
}
