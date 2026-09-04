import type { Uint8ArrayBuffer } from '@datadog/js-core/util'

// eslint-disable-next-line no-restricted-syntax
export class Deflate {
  chunks: Uint8ArrayBuffer[]
  result: Uint8ArrayBuffer
  strm: { adler: number }
  push(data: Uint8ArrayBuffer | ArrayBuffer | string, flushMode: number | boolean): boolean
}

export const constants: {
  [name: string]: number
}
