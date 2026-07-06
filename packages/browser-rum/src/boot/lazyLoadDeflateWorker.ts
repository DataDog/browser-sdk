import { mockable } from '@datadog/browser-core'
// Type-only import: erased at compile time, so it does not pull the deflate worker (and its inlined
// worker string) into the main bundle. The actual module is loaded lazily via `importDeflateWorker`.
import type * as deflate from '../domain/deflate'
import { reportScriptLoadingError } from '../domain/scriptLoadingError'

export type DeflateModule = typeof deflate

export async function lazyLoadDeflateWorker(): Promise<DeflateModule | undefined> {
  try {
    return await mockable(importDeflateWorker)()
  } catch (error: unknown) {
    reportScriptLoadingError({
      error,
      source: 'Deflate worker',
      scriptType: 'module',
    })
  }
}

export function importDeflateWorker(): Promise<DeflateModule> {
  return import(/* webpackChunkName: "datadogDeflateWorker" */ '../domain/deflate')
}
