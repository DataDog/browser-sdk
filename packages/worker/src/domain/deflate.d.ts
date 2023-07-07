export class Deflate {
  chunks: Uint8Array[]
  result: Uint8Array
  push(data: Uint8Array | ArrayBuffer | string, flushMode: number | boolean): boolean
}

export const constants: {
  [name: string]: number
}

export function string2buf(input: string): Uint8Array
