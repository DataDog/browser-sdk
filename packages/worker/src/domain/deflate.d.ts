export class Deflate {
  chunks: Uint8Array[]
  result: Uint8Array
  strm: { adler: number }
  push(data: Uint8Array | ArrayBuffer | string, flushMode: number | boolean): boolean
}

export const Z_SYNC_FLUSH: number

export function string2buf(input: string): Uint8Array
